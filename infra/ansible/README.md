# Ansible

Minecraft サーバーの初期構築と運用設定を Ansible で反映するためのディレクトリです。接続は AWS Systems Manager Session Manager を前提にし、inventory では `amazon.aws.aws_ssm` を使います。

## 構成

- `playbooks/site.yml`: 実体の playbook
- `site.yml`: 既存コマンド互換の wrapper
- `inventory/production/hosts.yml`: production inventory
- `inventory/production/group_vars/all.yml`: 共通変数
- `roles/common`: 実行ユーザーとディレクトリの準備
- `roles/java`: Java 21 Corretto の導入
- `roles/linuxgsm`: LinuxGSM の導入と設定
- `roles/minecraft`: Minecraft サーバー配布物と `mcserver.cfg` の配置
- `roles/wrapper-scripts`: 運用用 wrapper script の配置
- `roles/monitoring`: CloudWatch Agent の導入と設定

`tasks/main.yml` は role 内の入口だけにし、実処理は `install.yml` `configure.yml` `service.yml` などへ分割しています。

## 実行

リポジトリ root から実行します。

```bash
aws login
make ansible-ssm
make ansible-ssm-check
make ansible-ssm-op
make ansible-ssm-op-check
make ssm-session
```

- `ansible-ssm`: CloudFormation と Secrets Manager から値を解決して playbook を実行する
- `ansible-ssm-check`: `--check` 付きで dry-run する
- `ansible-ssm-op`: 1Password の `aws` ラッパー利用時に認証差分を吸収して実行する
- `ansible-ssm-op-check`: `ansible-ssm-op` の dry-run
- `ssm-session`: 対象 EC2 に Session Manager で接続する

playbook を直接叩く場合:

```bash
AWS_REGION="ap-northeast-1" \
MINECRAFT_INSTANCE_ID="i-xxxxxxxxxxxxxxxxx" \
MINECRAFT_SSM_BUCKET="minecraft-ssm-bucket" \
MINECRAFT_RCON_PASSWORD="secret" \
uv run ansible-playbook \
  -i infra/ansible/inventory/production/hosts.yml \
  infra/ansible/site.yml
```

## 前提

- 先に `aws login` で AWS CLI セッションが有効になっていること
- ローカルに `session-manager-plugin` が入っていること
- Ansible 実行環境に `boto3` / `botocore` が入っていること
- `amazon.aws` collection が使えること
- `MINECRAFT_INSTANCE_ID` `MINECRAFT_SSM_BUCKET` `MINECRAFT_RCON_PASSWORD` を解決できること

`make ansible-ssm` は `.venv/bin/ansible-playbook` と `.venv/bin/ansible-galaxy` があればそれを優先します。`amazon.aws.aws_ssm` はローカル側の Python で動くため、Ansible を実行している同じ環境に `boto3` が必要です。

## 静的検証と role テスト

```bash
make yaml-lint
make ansible-lint
make ansible-syntax-check
make molecule-test
```

- `yaml-lint`: YAML 全体を検証する
- `ansible-lint`: `infra/ansible` 配下を検証する
- `ansible-syntax-check`: production inventory 前提で playbook の構文を確認する
- `molecule-test`: Molecule scenario を順番に実行する

現在 Molecule を用意しているのは `common` `java` `wrapper-scripts` の 3 role です。いずれも Docker driver を前提にしています。
