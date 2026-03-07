# Ansible コーディング規約

## 1. 目的

本ドキュメントは、Ansible によるインフラ構成管理の品質・安全性・可読性を維持するためのコーディング規約を定義する。

本規約は以下を目的とする。

- 構成管理の再現性を確保する
- 可読性の高い Playbook を維持する
- インフラ変更の安全性を高める
- AI による Playbook 生成の品質を安定させる

---

# 2. 基本方針

- idempotent なタスクを作成する
- 1つの role は1つの責務とする
- 明示的な変数を使用する
- secrets を Playbook に書かない
- inventory に依存したロジックを避ける

---

# 3. ディレクトリ構成

標準構成:

```
ansible/
  inventory/
  playbooks/
  roles/
  group_vars/
  host_vars/
```

---

# 4. Playbook 設計

Playbook は orchestration のみ担当する。

責務:

- role 呼び出し
- host 指定
- 変数定義

Playbook にロジックを書かない。

例:

```yaml
- hosts: web
  roles:
    - nginx
```

---

# 5. Role 設計

Role は単一責務とする。

例:

```
nginx
docker
node
postgres
```

1 role = 1 component

---

# 6. タスク設計

タスクは idempotent にする。

NG:

```
command: apt install nginx
```

OK:

```
apt:
  name: nginx
  state: present
```

---

# 7. shell / command

以下の場合のみ使用する。

- モジュールが存在しない場合
- OS 特有処理

必ず条件を書く。

```
changed_when:
```

---

# 8. 変数

変数は snake_case。

例:

```
nginx_worker_processes
db_host
```

---

# 9. 変数定義

優先順位:

1 group_vars  
2 host_vars  
3 role defaults

Playbook 内での変数定義は最小限。

---

# 10. テンプレート

設定ファイルは template を使用する。

```
templates/nginx.conf.j2
```

---

# 11. secrets 管理

以下は禁止:

- パスワード直書き
- APIキー直書き

必ず使用:

- ansible-vault
- secrets manager

---

# 12. 条件分岐

条件は明示的に書く。

```
when: ansible_os_family == "Debian"
```

---

# 13. 冪等性

Playbook は何度実行しても同じ状態になる必要がある。

---

# 14. テスト

以下を実施する。

- syntax check
- lint
- dry-run

```
ansible-playbook --check
```

---

# 15. CI

CI では以下を必須とする。

- ansible-lint
- syntax check

---

# 16. AI 利用ルール

AI は以下を守る。

禁止:

- shell 乱用
- 冪等性を壊すタスク
- secrets の直書き

必須:

- idempotent タスク
- モジュール優先
- role 単位設計