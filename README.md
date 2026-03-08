# Minecraft Discord 管理システム

このリポジトリは、Discord スラッシュコマンドから Minecraft サーバーを管理するためのプロトタイプです。

現時点の PoC 完了範囲と既知の制約は [docs/poc-status.md](docs/poc-status.md) を参照してください。

## できること

- `/mc start` `/mc stop` `/mc status`
- `/mc cmd`
- `/mc whitelist add/remove/list/on/off`
- `/mc admin grant/revoke`
- `/mc gamemode survival|creative|adventure|spectator`
- `/mc playtime player|top`
- プレイヤー入退室通知
- `/mc stop` 時に最新ワールドを S3 へ backup

詳細は [docs/commands.md](docs/commands.md) を参照してください。

## セットアップ

1. `aws login`
2. `npm install`
3. `npm run typecheck`
4. `npm run test`
5. `make cdk-deploy`
6. Secrets Manager に Discord / RCON の値を投入
7. 必要なら `/minecraft/player-event-webhook-url` に Discord Webhook URL を投入
8. `make register-commands` で slash command を登録
9. Discord Developer Portal に Function URL を `Interactions Endpoint URL` として設定
10. `make ansible-ssm-op` で Session Manager 経由の Ansible を実行

詳細な手順は [docs/setup.md](docs/setup.md) を参照してください。

## リポジトリ構成

- CDK の実装本体: `infra/cdk/lib/stacks/`, `infra/cdk/lib/constructs/`
- CDK の設定/補助処理: `infra/cdk/lib/config/`, `infra/cdk/lib/helpers/`
- CDK のエントリーポイント: `infra/cdk/bin/app.ts`
- CDK のテスト: `infra/cdk/test/stacks/`
- Ansible の実行本体: `infra/ansible/playbooks/site.yml`
- Ansible の inventory: `infra/ansible/inventory/production/`
- Ansible の role 実装本体: `infra/ansible/roles/*/tasks/*.yml`
- `infra/ansible/site.yml` は既存コマンド互換の wrapper

CDK の詳細なレイアウトは [infra/cdk/README.md](infra/cdk/README.md) を参照してください。
Ansible の詳細は [infra/ansible/README.md](infra/ansible/README.md) を参照してください。

## 実行入口

```bash
aws login
make register-commands
make cdk-synth
make cdk-diff
make cdk-deploy
make ansible-ssm
make ansible-ssm-check
make ansible-ssm-op
make ansible-ssm-op-check
make ssm-session
make yaml-lint
make ansible-lint
make ansible-syntax-check
make molecule-test
```

- `aws login`: AWS CLI のセッションを先に確立する
- `register-commands`: Discord slash command を再登録する
- `cdk-synth`: CDK テンプレートを生成する
- `cdk-diff`: CDK の差分を確認する
- `cdk-deploy`: CDK を deploy する
- `ansible-ssm`: CloudFormation / Secrets Manager から値を解決して Ansible を実行する
- `ansible-ssm-op`: 1Password と `boto3` の認証差分を吸収しながら Ansible を実行する
- `ssm-session`: `Compute` の `InstanceId` を解決して Session Manager を開始する
- `yaml-lint`: YAML 全体を `yamllint` で検証する
- `ansible-lint`: `infra/ansible` を `ansible-lint` で検証する
- `ansible-syntax-check`: production inventory 前提で Playbook の構文検証を行う
- `molecule-test`: role 向け Molecule scenario を順番に実行する

1Password CLI 前提で包む場合:
```bash
aws login
op run -- make register-commands
op run -- make ansible-ssm
```

`uv` で管理する Ansible を使う場合:
```bash
uv add ansible-core boto3 botocore
aws login
ANSIBLE_GALAXY_CMD="uv run ansible-galaxy" ANSIBLE_PLAYBOOK_CMD="uv run ansible-playbook" op run -- make ansible-ssm
```

`.venv/bin/ansible-playbook` と `.venv/bin/ansible-galaxy` があれば、`make ansible-ssm` はそれらを優先します。`amazon.aws.aws_ssm` 接続では、Ansible を実行している同じ Python 環境に `boto3` / `botocore` が必要です。

1Password と `boto3` の認証経路差分を吸収する場合:
```bash
uv add ansible-core boto3 botocore
aws login
AWS_CLI_BIN="/path/to/aws" \
ANSIBLE_GALAXY_CMD="uv run ansible-galaxy" \
ANSIBLE_PLAYBOOK_CMD="uv run ansible-playbook" \
make ansible-ssm-op
```

`AWS_CLI_BIN` は必要な場合だけ、自分の環境の `aws` 実体パスに置き換えて指定します。

`make cdk-synth` `make cdk-diff` `make cdk-deploy` `make ansible-ssm` `make ansible-ssm-op` は、`aws login` 済みの CLI セッションを前提にしています。

Session Manager 接続には `session-manager-plugin` が必要です。
```bash
brew install --cask session-manager-plugin
```

## 開発コマンド

```bash
npm install
npm run build
npm run typecheck
npm run test
npm run lint
```

CDK 単体で確認する場合:
```bash
npm run -w infra/cdk lint
npm run -w infra/cdk typecheck
npm run -w infra/cdk test
npm run -w infra/cdk synth
```
