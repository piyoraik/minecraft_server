# Minecraft Discord 管理システム

このリポジトリは、Discord スラッシュコマンドから Minecraft サーバーを管理するためのプロトタイプです。

現時点の PoC 完了範囲と既知の制約は [docs/poc-status.md](/Users/s-tanaka/work/minecraft/docs/poc-status.md) を参照してください。

## できること

- `/mc start` `/mc stop` `/mc status`
- `/mc cmd`
- `/mc whitelist add/remove/list/on/off`
- `/mc admin grant/revoke`
- `/mc gamemode survival|creative|adventure|spectator`
- `/mc playtime player|top`
- プレイヤー入退室通知

詳細は [docs/commands.md](/Users/s-tanaka/work/minecraft/docs/commands.md) を参照してください。

## セットアップ

1. `npm install`
2. `npm run typecheck`
3. `npm run test`
4. `cd /Users/s-tanaka/work/minecraft/infra/cdk && cdk deploy --all`
5. Secrets Manager に Discord / RCON の値を投入
6. 必要なら `/minecraft/player-event-webhook-url` に Discord Webhook URL を投入
7. `make register-commands` で slash command を登録
8. Discord Developer Portal に Function URL を `Interactions Endpoint URL` として設定
9. `make ansible-ssm-op` で Session Manager 経由の Ansible を実行

詳細な手順は [docs/setup.md](/Users/s-tanaka/work/minecraft/docs/setup.md) を参照してください。

## 実行入口

```bash
make register-commands
make ansible-ssm
make ansible-ssm-check
make ansible-ssm-op
make ansible-ssm-op-check
make ssm-session
```

- `register-commands`: Discord slash command を再登録する
- `ansible-ssm`: CloudFormation / Secrets Manager から値を解決して Ansible を実行する
- `ansible-ssm-op`: 1Password と `boto3` の認証差分を吸収しながら Ansible を実行する
- `ssm-session`: `ComputeStack` の `InstanceId` を解決して Session Manager を開始する

1Password CLI 前提で包む場合:
```bash
op run -- make register-commands
op run -- make ansible-ssm
```

`uv` で管理する Ansible を使う場合:
```bash
uv add ansible-core boto3 botocore
ANSIBLE_GALAXY_CMD="uv run ansible-galaxy" ANSIBLE_PLAYBOOK_CMD="uv run ansible-playbook" op run -- make ansible-ssm
```

1Password と `boto3` の認証経路差分を吸収する場合:
```bash
uv add ansible-core boto3 botocore
AWS_CLI_BIN="/Users/s-tanaka/.local/share/mise/installs/aws/2.34.4/aws-cli.pkg/Payload/aws-cli/aws" \
ANSIBLE_GALAXY_CMD="uv run ansible-galaxy" \
ANSIBLE_PLAYBOOK_CMD="uv run ansible-playbook" \
make ansible-ssm-op
```

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
