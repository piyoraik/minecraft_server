# コーディング規約

## 1. 目的

本ドキュメントは、開発者および AI エージェント（Claude、Codex 等）が一貫した品質でコードを実装するための指針を定める。

目的は以下とする。

- 可読性の高いコードを維持する
- 型安全性を確保する
- 明確なアーキテクチャを維持する
- テストによって品質を保証する
- AI を利用した開発の品質を安定させる

---

## 2. 基本方針

- リポジトリ内の既存コードの規約に従う
- トリッキーな実装よりも可読性を優先する
- 型安全性を重視する
- 実装とテストはセットで作成する
- `lint`、`typecheck`、`test` がすべて成功している状態を完了条件とする

---

## 3. 適用範囲

本規約は以下に適用する。

- TypeScript
- Node.js
- React / Next.js（該当するプロジェクト）
- API / バックエンド開発

人間による実装・AI による実装の両方に適用する。

---

## 4. 命名規則

### 変数 / 関数

camelCase を使用する。

```
userId
getUserProfile
createSession
```

---

### 型 / クラス / コンポーネント

PascalCase を使用する。

```
User
UserProfile
AuthService
```

---

### 定数

UPPER_SNAKE_CASE を使用する。

```
MAX_RETRY_COUNT
DEFAULT_TIMEOUT
```

---

### boolean

真偽値であることが明確に分かる命名を使用する。

接頭辞: `is` / `has` / `can`

```
isActive
hasPermission
canEdit
```

---

## 5. 変数

- 再代入が不要な場合は `const` を使用する
- 再代入が必要な場合のみ `let` を使用する
- `var` の使用は禁止する

```ts
const user = getUser()
let retryCount = 0
```

変数は可能な限り使用箇所の近くで宣言する。

---

## 6. 文字列・配列・オブジェクト

### 文字列

文字列連結ではなくテンプレートリテラルを使用する。

```ts
const message = `User ID: ${userId}`
```

---

### 配列

リテラル構文を使用する。

```ts
const users: User[] = []
```

---

### オブジェクト

オブジェクトリテラルを使用する。

```ts
const user = {
  id,
  name
}
```

---

### オブジェクトコピー

スプレッド構文を使用する。

```ts
const newUser = { ...user }
```

---

## 7. 関数

原則としてアロー関数を使用する。

```ts
const getUser = (id: string): User => {
  return repository.find(id)
}
```

以下の場合に限り、function 宣言を許容する。

- スタックトレースで関数名が明確に必要な場合
- `this` のバインディングが必要なクラスメソッド
- フレームワーク仕様で function 宣言が求められる場合（Next.js の `getServerSideProps` 等）

関数設計の原則:

- 1関数1責務
- 引数は必要最小限にする
- 不要な副作用を避ける

---

## 8. TypeScript ルール

### strict モード

TypeScript は strict モードを前提とする。

```json
{
  "strict": true
}
```

---

### type / interface

基本は `type` を使用する。

拡張や宣言マージが必要な場合のみ `interface` を使用する。

```ts
// 基本
type User = {
  id: string
  name: string
}

// 拡張が必要な場合のみ interface
interface AdminUser extends User {
  role: string
}
```

---

### any

`any` は使用禁止とする。

---

### unknown

外部境界でのみ使用可能とする。

対象:
- API レスポンス
- 環境変数
- 外部ライブラリの戻り値

`unknown` を受け取った場合は、必ず型ガードで narrowing してから使用する。

```ts
// NG: unknown のまま使用
function process(value: unknown) {
  console.log(value.name) // エラー
}

// OK: 型ガードで narrowing してから使用
function isUser(value: unknown): value is User {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "name" in value
  )
}

function process(value: unknown) {
  if (!isUser(value)) {
    throw new Error("Invalid user data")
  }
  console.log(value.name) // 安全
}
```

---

### 型アサーション

`as` の使用は最小限にする。

---

### 非 null アサーション

`!` の使用は禁止する。

---

## 9. 条件分岐

比較には厳密等価演算子を使用する。

```ts
if (value === 1) {
}
```

---

### ネストの回避

ネストが深くなる場合は早期 return を使用する。

```ts
if (!user) {
  return null
}
```

---

## 10. import / export

import はファイル先頭にまとめる。

import の順序は以下の順に記述し、グループ間に空行を入れる。

1. Node.js 組み込みモジュール
2. 外部ライブラリ（node_modules）
3. 内部モジュール（絶対パス / エイリアス）
4. 相対パス

```ts
import { readFile } from "fs"

import { z } from "zod"

import { UserRepository } from "@/repositories/user"

import { formatDate } from "./utils"
```

同一モジュールの import はまとめる。ワイルドカード import は避ける。

---

### default export

原則として default export を禁止する。代わりに named export を使用する。

```ts
export const getUser = () => {}
```

例外:
- Next.js のページコンポーネント
- フレームワーク仕様で必要な場合

---

## 11. コメント・JSDoc

コメントは日本語で記述する。

コメントを書く基準:

- コードを読んでも「なぜそうしているか」が分からない場合に書く
- コードを読めば分かる内容（「何をしているか」）はコメント不要

```ts
// NG: 何をしているかをそのまま書いている
// ユーザーを取得する
const user = getUser(id)

// OK: なぜそうしているかを書いている
// キャッシュが stale な可能性があるため、DB から直接取得する
const user = repository.findById(id)
```

---

### JSDoc を必須とする対象

以下のいずれかに該当する場合は JSDoc を記述する。

- 外部公開 API
- ライブラリ境界の関数・クラス
- service 層の主要な関数
- 複雑なビジネスロジック
- 副作用のある処理
- 呼び出し条件・前提・制約・例外が重要な処理

```ts
/**
 * 指定ユーザーの権限を検証する。
 * 権限がない場合は PermissionError をスローする。
 *
 * @param userId - 検証対象のユーザー ID
 * @param action - 実行しようとしているアクション
 * @throws {PermissionError} ユーザーに該当アクションの権限がない場合
 */
const validatePermission = (userId: string, action: Action): void => {
  // ...
}
```

---

### JSDoc を任意とする対象

以下は状況に応じて記述する。

- repository 層の単純な CRUD
- 内部 util 関数
- 型や関数名だけで意図が明確な処理

---

### JSDoc を不要とする対象

以下は JSDoc を書かない。

- trivial な helper 関数
- 自明な getter / mapper / formatter
- 一時的で極小のローカル関数

---

## 12. エラーハンドリング

原則:

- エラーを握りつぶさない
- 意味のあるエラーを返す
- エラーはログに記録する

```ts
// NG
catch (e) {
  return null
}

// OK
catch (error) {
  logger.error(error)
  throw new UserFetchError()
}
```

---

## 13. ログ

ログは以下を満たすこと。

- 調査に必要な情報を含む
- 個人情報や機密情報を含まない
- 構造化ログを推奨する

出力禁止:
- パスワード
- トークン
- シークレット
- 個人情報

---

## 14. アーキテクチャ

### バックエンド構成

責務を明確に分離する。

```
controller   // HTTP リクエスト処理 / バリデーション / 認証・認可
service      // ビジネスロジック / 処理のオーケストレーション
repository   // DB アクセス / 永続化処理
```

---

### フロントエンド構成（React / Next.js）

Feature / Colocation ベースの構成を採用する。

機能単位でディレクトリをまとめ、コンポーネント・hooks・型を同じ場所に置く。

```
src/
  features/
    user/
      components/   // UIコンポーネント
      hooks/        // カスタムフック
      types/        // 型定義
      index.ts      // 外部公開する API のみを re-export
    auth/
      components/
      hooks/
      types/
      index.ts
  shared/
    components/     // 汎用コンポーネント
    hooks/          // 汎用フック
    utils/          // ユーティリティ関数
    types/          // 共通型定義
```

ルール:

- feature 間は直接 import せず、`index.ts` 経由でアクセスする
- 特定の feature にのみ依存するコードは `shared/` に置かない
- コンポーネントは presentational と container に分けることを検討する

---

## 15. 依存関係

新規ライブラリ追加には理由が必要とする。

ルール:

- 既存ライブラリで解決できる場合は追加しない
- 同種ライブラリを複数導入しない
- 不要なユーティリティライブラリを追加しない

---

## 16. セキュリティ

以下は禁止する。

- シークレットの直書き
- SQL 文字列連結
- 未検証入力の使用
- 機密情報のログ出力

外部入力は必ず検証する。

---

## 17. テスト方針

実装とテストは必ずセットで作成する。

テストフレームワークはプロジェクトの既存テスト基盤に従う。

以下の場合はテスト必須とする。

- 新規ロジック追加
- バグ修正

---

## 18. テストの種類

### Unit Test

対象:
- 純粋関数
- service ロジック
- ユーティリティ

外部依存はモック化する。

---

### Integration Test

対象:
- API ハンドラー
- DB
- サービス連携

---

### E2E Test

重要なユーザーフローのみ対象とする。

対象例:
- 認証
- メイン業務フロー
- データ更新処理

E2E テストは必要最小限にする。

---

## 19. テスト設計

テストは以下をカバーする。

- 正常系
- 異常系
- 境界値

---

### テスト構造

AAA パターンを使用する。

```ts
// Arrange
const user = createUser()

// Act
const result = service.getUser(user.id)

// Assert
expect(result.id).toBe(user.id)
```

---

## 20. バグ修正ルール

バグ修正時は以下の手順を必ず守る。

1. バグを再現するテストを書く
2. テストが失敗することを確認する
3. 修正する
4. テストが成功することを確認する

---

## 21. モック

以下はモック対象とする。

- 外部 API
- データベース
- ネットワーク
- 時刻
- ランダム値

実装に強く依存した過剰なモックは避ける。

---

## 22. CI

CI では以下を必須とする。

- lint
- typecheck
- unit test

CI が失敗している場合はマージ不可とする。

---

## 23. Git

### コミットメッセージ

日本語で内容を自由に記述する。

以下の点を意識して書く。

- 「何を」ではなく「なぜ」変更したかを書く
- 1コミット1変更を意識する

```
# NG: 何をしたかだけ
ユーザー取得処理を修正

# OK: なぜ変更したかが分かる
キャッシュが stale になるケースを修正するため、ユーザー取得を DB から直接取得に変更
```

---

### ブランチ命名

以下の形式を推奨する。

```
feature/機能名
fix/バグ内容
chore/作業内容
```

---

## 24. AI エージェント利用ルール

Claude / Codex などの AI は以下を遵守する。

---

### 禁止事項

**コード品質**
- 無関係なリファクタ
- 指示のない API 変更
- テスト削除
- テストを弱めて成功させる行為
- TODO のまま実装を残す

**ファイル・ディレクトリ操作**
- 既存のディレクトリ構造・ファイル構成を無断で変更しない
- 既存ファイルの命名規則を無断で変更しない
- 複数の関係ないファイルをまとめて変更しない

**依存関係**
- ライブラリを無断で追加しない（必要な場合は理由を説明し、確認を求める）
- package.json のバージョンを無断で変更しない

---

### 必須事項

- 新規コードにはテストを追加する
- 挙動変更時は理由を説明する
- lint / typecheck / test を成功させる
- 生成したコードに対してレビュー観点（考慮漏れ・副作用・セキュリティ上の懸念等）を自己申告する
- 1タスクで変更するファイルは必要最小限にする

---

### 確認が必要な場合

以下の場合は実装を止め、人間に確認を求める。

- 要件が曖昧で複数の解釈が可能な場合
- 新規ライブラリの追加が必要な場合
- 既存のアーキテクチャから逸脱する実装が必要に見える場合
- セキュリティに関わる変更が必要な場合
- 既存テストの変更が必要な場合

---

## 25. 完了条件

以下をすべて満たした場合のみタスク完了とする。

- lint 成功
- typecheck 成功
- test 成功
- 実装意図が説明可能
