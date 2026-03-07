## CDK Layout

- `bin/`: app entrypoint
- `stacks/`: stack 実装本体
- `constructs/`: 再利用可能な construct
- `lib/`: 既存 import 互換の re-export

日常の変更対象は `stacks/` と `constructs/` を優先する。
