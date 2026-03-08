# Setup

PoC として確認済みの範囲、既知の制約、残作業は [poc-status.md](poc-status.md) を参照する。

1. 依存関係をインストールする
```bash
aws login
npm install
npm run typecheck
npm run test
```

2. CDK をデプロイする
```bash
make cdk-deploy
```

CDK の実装本体は `infra/cdk/lib/stacks/` と `infra/cdk/lib/constructs/` にある。設定値は `infra/cdk/lib/config/`、補助処理は `infra/cdk/lib/helpers/` に配置している。

Ansible の inventory は `infra/ansible/inventory/production/hosts.yml` を起点にし、共通変数は `infra/ansible/inventory/production/group_vars/all.yml` に配置している。

`Lambda` から Ansible 用 S3 バケット名、`Compute` から EC2 Instance ID が出力される

3. Secrets Manager に値を投入する
```bash
aws secretsmanager put-secret-value --secret-id /minecraft/discord-token --secret-string "BOT_TOKEN"
aws secretsmanager put-secret-value --secret-id /minecraft/discord-public-key --secret-string "PUBLIC_KEY"
aws secretsmanager put-secret-value --secret-id /minecraft/discord-application-id --secret-string "APPLICATION_ID"
aws secretsmanager put-secret-value --secret-id /minecraft/rcon-password --secret-string "RCON_PASSWORD"
aws secretsmanager put-secret-value --secret-id /minecraft/player-event-webhook-url --secret-string "DISCORD_WEBHOOK_URL"
```

4. Discord の slash command を登録する
```bash
make register-commands
```

必要に応じてリージョンや Secret 名を上書きする
```bash
export AWS_REGION="ap-northeast-1"
export DISCORD_APPLICATION_ID_SECRET_ID="/minecraft/discord-application-id"
export DISCORD_BOT_TOKEN_SECRET_ID="/minecraft/discord-token"
./scripts/register-discord-commands.sh
```

5. Discord Developer Portal の `Interactions Endpoint URL` に Lambda Function URL を設定する

6. Ansible を実行して EC2 を初期セットアップする
```bash
export AWS_REGION="ap-northeast-1"
make ansible-ssm
```

Ansible の playbook 実体は `infra/ansible/playbooks/site.yml` で、`infra/ansible/site.yml` は既存実行経路との互換用 wrapper になっている。

Session Manager 接続の前提:
- 先に `aws login` で AWS CLI セッションが有効になっていること
- ローカルに `session-manager-plugin` が入っていること
- macOS の例:
```bash
brew install --cask session-manager-plugin
```
- ローカルに `boto3` / `botocore` が入っていること
- EC2 が SSM 管理対象として `aws ssm start-session --target $(aws cloudformation describe-stacks --stack-name Compute --region ap-northeast-1 --query "Stacks[0].Outputs[?OutputKey=='InstanceId'].OutputValue | [0]" --output text)` で接続できること

必要に応じて上書きできる値:
```bash
export AWS_REGION="ap-northeast-1"
export COMPUTE_STACK_NAME="Compute"
export LAMBDA_STACK_NAME="Lambda"
export RCON_SECRET_ID="/minecraft/rcon-password"
make ansible-ssm-check
```

Ansible の静的検証と role テスト:
```bash
make yaml-lint
make ansible-lint
make ansible-syntax-check
make molecule-test
```

1Password CLI を使う場合:
```bash
aws login
op run -- make register-commands
op run -- make ansible-ssm
```

`uv` 環境の Ansible を使う場合:
```bash
uv add ansible-core boto3 botocore
aws login
ANSIBLE_GALAXY_CMD="uv run ansible-galaxy" \
ANSIBLE_PLAYBOOK_CMD="uv run ansible-playbook" \
op run -- make ansible-ssm
```

1Password の `aws` ラッパーを使いつつ `boto3` へ認証を橋渡しする場合:
```bash
uv add ansible-core boto3 botocore
aws login
AWS_CLI_BIN="/path/to/aws" \
ANSIBLE_GALAXY_CMD="uv run ansible-galaxy" \
ANSIBLE_PLAYBOOK_CMD="uv run ansible-playbook" \
make ansible-ssm-op
```

`AWS_CLI_BIN` は必要な場合だけ、自分の環境の `aws` 実体パスへ置き換える。
