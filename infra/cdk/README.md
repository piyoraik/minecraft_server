## CDK Layout

- `bin/`: app entrypoint
- `lib/stacks/`: stack 実装本体
- `lib/constructs/`: 再利用可能な construct
- `lib/config/`: 環境差分と設定値
- `lib/helpers/`: タグ付与や Lambda 補助処理
- `test/stacks/`: assertions ベースの stack テスト

日常の変更対象は `lib/stacks/` と `lib/constructs/` を優先する。
