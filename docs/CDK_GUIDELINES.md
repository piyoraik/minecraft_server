# AWS CDK コーディング規約

## 1. 目的

本ドキュメントは AWS CDK を用いた Infrastructure as Code のコーディング規約を定義する。

目的:

- 再現可能なインフラ構築
- 安全な変更管理
- 可読性の高い CDK コード
- AI による IaC 生成の品質向上

---

# 2. 基本方針

- L2 Construct を優先する
- L1 Construct は必要な場合のみ使用
- Stack は小さく保つ
- 再利用可能な Construct を作成する
- 環境差分は context / config で管理する

---

# 3. ディレクトリ構成

例:

```
cdk/
  bin/
  lib/
  constructs/
  stacks/
```

---

# 4. Stack 設計

1 Stack = 1 system component

例:

```
network-stack
database-stack
application-stack
```

Stack を巨大化させない。

---

# 5. Construct 設計

再利用可能なインフラは Construct 化する。

例:

```
VpcConstruct
RdsConstruct
EksClusterConstruct
```

---

# 6. 命名

リソース名は以下の形式。

```
project-env-resource
```

例:

```
myapp-prod-vpc
myapp-prod-eks
```

---

# 7. 環境差分

環境差分は以下で管理する。

- context
- config file
- environment variables

コード分岐は禁止。

---

# 8. パラメータ

環境差分は construct props で渡す。

```
new VpcConstruct(this, "Vpc", {
  cidr: config.vpcCidr
})
```

---

# 9. Secrets

以下は禁止。

- secret 直書き

使用:

- Secrets Manager
- SSM Parameter Store

---

# 10. IAM

IAM policy は最小権限。

NG:

```
AdministratorAccess
```

---

# 11. Outputs

重要リソースは Output を定義する。

---

# 12. テスト

以下を実施する。

- synth
- snapshot test
- assertions

---

# 13. CI

CI で実施:

```
cdk synth
cdk diff
```

---

# 14. AI 利用ルール

AI は以下を守る。

禁止:

- L1 construct の乱用
- IAM フル権限
- secret 直書き

必須:

- Construct 分割
- Stack 分割
- 環境差分分離