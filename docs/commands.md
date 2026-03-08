# Commands

- `/mc start`: EC2 を起動し、必要なら Minecraft サーバーも起動する
- `/mc stop`: Minecraft を停止してから EC2 を停止する
- `/mc status`: EC2 と Minecraft の状態、および接続先IPを確認する
- `/mc backup`: 手動で S3 backup を取得する
- `/mc restore`: まず確認ボタンを返し、承認後に latest backup を restore する
  - EC2 が稼働中なら backup を取らずに Minecraft を停止して restore し、その後 Minecraft を再起動する
  - EC2 が停止中なら一時起動して restore し、その後 Minecraft を起動したままにする
- `/mc difficulty peaceful|easy|normal|hard`: 難易度を変更する
- `/mc morning`: ゲーム内時刻を朝にする
- `/mc cmd`: 許可された Minecraft コマンドを実行する
  - 初期 allowlist: `list`, `say ...`, `save-all`, `save-on`, `save-off`, `time set ...`, `weather ...`, `difficulty ...`
- `/mc whitelist add/remove/list/on/off`: ホワイトリストを管理する
- `/mc admin grant/revoke`: 管理者権限を付与・剥奪する
- `/mc gamemode survival|creative|adventure|spectator`: デフォルトゲームモードを変更する
- `/mc playtime player <name>`: 指定プレイヤーの累計プレイ時間と現在状態を表示する
- `/mc playtime top`: プレイ時間ランキングを表示する
