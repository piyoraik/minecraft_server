# PoC Status

## 現時点で確認できていること

- Discord Interactions Endpoint の署名検証が通る
- `/mc start` `/mc stop` `/mc status` の slash command 登録ができる
- Discord 受付 Lambda から command-processor Lambda を非同期起動できる
- command-processor Lambda から EC2 / SSM / Discord follow-up を実行できる
- Ansible を Session Manager 経由で実行できる
- EC2 上で LinuxGSM と Minecraft Java server を起動できる
- `mc-status` の結果を Discord 向けに整形して返せる
- `/mc status` では `Minecraft Server Details` のみを code block で返し、`RCON password` は出力しない

## PoC としてできること

- Discord から Minecraft サーバーの起動を要求する
- Discord から Minecraft サーバーの停止を要求する
- Discord から Minecraft サーバーの状態と接続先 IP を確認する
- EC2 上で `mc-start` `mc-stop` `mc-status` を直接実行して切り分けする

## 既知の制約

- LinuxGSM の表示系に一部ノイズがある
  - `info_game.sh` 由来の表示ずれが残る場合がある
- `systemd` ではなく LinuxGSM + `tmux` でプロセス管理している
- EC2 / Lambda / Discord をまたぐため、古い `dist` を配備すると不整合が起きやすい
- `ComputeStack` の x86_64 化は、`LambdaStack` との参照関係解消後に順序を守って反映する必要がある

## 未対応事項

- `systemd` unit を追加して EC2 再起動後の自動起動を保証する
- ドキュメント内の古い Minecraft バージョン記述を実装値に合わせて更新する
- CDK / Lambda / Ansible の最終デプロイ手順を 1 本の確定運用手順に整理する
- 監視やアラートの閾値、障害時のリカバリ手順を詰める

## 安定運用前にやるべきこと

1. `LambdaStack` と `ComputeStack` の更新順を固定する
2. EC2 再起動後の Minecraft 自動復旧方針を決める
3. 失敗時の CloudWatch Logs / SSM ログ確認手順を README に寄せる
