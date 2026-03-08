# Minecraft Discord 管理システム 実装仕様書 v2

> **改訂履歴**
> - v1: 初版（レビュー前）
> - v2: アーキテクチャレビュー反映版（2026-03-07）
>   - Lambda 2段構成の追加
>   - Secrets Manager 設計の追加
>   - Security Group / EBS 設計の明示
>   - IAM 最小権限の具体化
>   - Ansible Role 分割の明確化
>   - AI実装向けにインターフェース定義を追加
> - v3: インスタンスタイプ変更（2026-03-07）
>   - `t3.medium` → `t4g.medium` に変更（Graviton2、コスト最適化）
>   - JVM ヒープを t4g.medium の RAM に合わせて調整（-Xmx2.5G）

---

## 1. 概要・目的

Discord の slash command から Minecraft サーバー用 EC2 を起動・停止し、
起動中は Minecraft のサーバーコマンドを実行できるシステム。

将来的に `/mc cmd`, `/mc backup`, `/mc debug` を追加しやすい拡張性を持った土台を構築する。

---

## 2. 技術スタック

| レイヤー | 技術 | 役割 |
|---------|------|------|
| IaC | AWS CDK (TypeScript) | AWSリソース定義 |
| EC2構成管理 | Ansible | EC2内のあるべき状態を管理 |
| プロセス管理 | LinuxGSM + systemd | Minecraftサーバーの起動停止 |
| コマンド実行 | RCON (`127.0.0.1:25575`) | Minecraftサーバーコマンド実行 |
| 実行経路 | AWS SSM RunCommand | ラッパースクリプト呼び出し |
| API (受付) | Lambda (TypeScript) | Discord署名検証・ACK返却 |
| API (処理) | Lambda (TypeScript) | AWS操作・Discord結果通知 |
| シークレット | AWS Secrets Manager | Token / Password 一元管理 |

### 設計方針（役割分担の明示）

| コンポーネント | 担当範囲 | やってはいけないこと |
|--------------|---------|-------------------|
| CDK | AWSリソース定義のみ | EC2内設定の変更 |
| Ansible | EC2内設定のみ | AWSリソースの作成 |
| SSM | ラッパースクリプトの呼び出しのみ | 構成変更・直接設定ファイル編集 |
| RCON | Minecraftコマンド実行のみ | プロセス管理（起動停止） |
| LinuxGSM | Minecraftプロセス管理のみ | AWS操作 |
| Lambda | Discord受付・AWS API呼び出しのみ | EC2内ファイル直接操作 |

---

## 3. アーキテクチャ

### 全体構成図

```
Discord
  │
  │ Slash Command (HTTPS POST)
  ▼
Lambda Function URL
  │
  ▼
┌─────────────────────────────────┐
│ 受付 Lambda (discord-handler)    │
│  1. Discord 署名検証             │
│  2. PING → PONG (type:1)        │
│  3. Command → ACK (type:5)      │
│  4. 処理 Lambda を非同期 Invoke  │
└──────────────┬──────────────────┘
               │ Lambda.invokeAsync
               ▼
┌─────────────────────────────────┐
│ 処理 Lambda (command-processor)  │
│  1. コマンド処理                  │
│  2. EC2 API 操作                 │
│  3. SSM RunCommand               │
│  4. follow-up webhook 送信       │
└──────┬──────────────┬────────────┘
       │              │
  EC2 API        SSM RunCommand
       │              │
       ▼              ▼
┌──────────────────────────────┐
│ EC2 (Amazon Linux 2023)      │
│  /usr/local/bin/mc-*         │ ← SSMから実行（ラッパースクリプト）
│        │                     │
│  LinuxGSM (systemd管理)      │
│  Minecraft Server            │
│  RCON (127.0.0.1:25575)      │
│        │                     │
│  EBS Volume (永続化)         │
└──────────────────────────────┘

Secrets Manager (/minecraft/*)
  ├─ discord-token
  ├─ discord-public-key
  ├─ discord-application-id
  └─ rcon-password

CloudWatch Logs
  ├─ /minecraft/lambda/discord-handler
  ├─ /minecraft/lambda/command-processor
  ├─ /minecraft/ec2/minecraft-server
  └─ /minecraft/ec2/system
```

### ⚠️ 重要: Discord インタラクション 3秒制限への対応

Discord Interaction API は **3秒以内にレスポンスがないとタイムアウトエラー** となる。
EC2 起動・停止・SSM実行は数十秒〜数分かかるため、**Lambda を2段構成** にする。

**受付 Lambda**: 即座に ACK (`type: 5`) を返し、処理 Lambda を非同期 Invoke して終了。
**処理 Lambda**: 実際の処理を行い、完了後に Discord follow-up webhook で結果を送信。

---

## 4. AWS設計

### 4.1 EC2 仕様

| 項目 | 値 |
|-----|---|
| AMI | Amazon Linux 2023 最新 (**arm64**) |
| インスタンスタイプ | `t4g.medium`（CDK Context で変更可能） |
| アーキテクチャ | ARM64 (Graviton2) |
| vCPU / RAM | 2 vCPU / 4 GB |
| EBS | 30GB gp3, **`deleteOnTermination: false`** |
| Elastic IP | 割り当てあり（IP固定） |
| SSM Agent | AL2023 プリインストール済み |
| UserData | SSM Agent 確認のみ。構成変更は Ansible で行う |
| Tags | `Project: minecraft-server`（IAM条件付き権限に使用） |

> **インスタンスタイプ選定理由**
> 3〜4人プレイを想定。Minecraft Java Edition は JVM 上で動作するため ARM64 でも問題なく稼働する。
> t4g.medium は t3.medium より約 20% 安価で同等スペック。
> RAM 4GB は3〜4人のバニラ〜軽量MOD環境で十分（ヒープ 2.5GB 確保可能）。
> MODパックや重量プラグインを導入する場合は `t4g.large`（8GB）に変更すること。
>
> ⚠️ **AMI は arm64 用を指定すること**。CDK で `MachineImage.latestAmazonLinux2023({ cpuType: AmazonLinuxCpuType.ARM_64 })` を使用する。

### 4.2 Security Group ルール

| 方向 | ポート | プロトコル | ソース | 用途 |
|-----|--------|-----------|--------|------|
| Inbound | 25565 | TCP | 0.0.0.0/0 | Minecraft クライアント接続 |
| Outbound | ALL | ALL | 0.0.0.0/0 | インターネットアクセス |

> **注意**: RCON ポート (25575) は **Security Group で開放しない**。
> RCON は `server.properties` で `server-ip=127.0.0.1` に設定し、localhost のみリッスンさせる。
> SSH ポート (22) は不要。アクセスは SSM Session Manager 経由で行う。

### 4.3 CDK Stack 分割

```
NetworkStack
  └─ Security Group
  └─ Elastic IP

ComputeStack (depends: NetworkStack)
  └─ IAM Instance Profile
  └─ EC2 Instance
  └─ Elastic IP Association

LambdaStack (depends: ComputeStack)
  └─ Secrets Manager シークレット x4（空で作成）
  └─ 受付 Lambda + Function URL + IAM Role
  └─ 処理 Lambda + IAM Role
```

### 4.4 Lambda 設定

| 項目 | 受付 Lambda | 処理 Lambda |
|-----|------------|------------|
| 関数名 | `minecraft-discord-handler` | `minecraft-command-processor` |
| Runtime | Node.js 20.x | Node.js 20.x |
| タイムアウト | 10秒 | 300秒 |
| メモリ | 256MB | 256MB |
| トリガー | Lambda Function URL | 受付 Lambda からの非同期 Invoke |
| Function URL AuthType | NONE | なし |

### 4.5 IAM 最小権限

#### 受付 Lambda 実行ロール

```json
[
  {
    "Effect": "Allow",
    "Action": ["lambda:InvokeFunction"],
    "Resource": "arn:aws:lambda:{region}:{account}:function:minecraft-command-processor"
  },
  {
    "Effect": "Allow",
    "Action": ["secretsmanager:GetSecretValue"],
    "Resource": "arn:aws:secretsmanager:{region}:{account}:secret:/minecraft/discord-*"
  },
  {
    "Effect": "Allow",
    "Action": ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"],
    "Resource": "arn:aws:logs:{region}:{account}:log-group:/minecraft/lambda/discord-handler:*"
  }
]
```

#### 処理 Lambda 実行ロール

```json
[
  {
    "Effect": "Allow",
    "Action": ["ec2:StartInstances", "ec2:StopInstances"],
    "Resource": "*",
    "Condition": {
      "StringEquals": {"ec2:ResourceTag/Project": "minecraft-server"}
    }
  },
  {
    "Effect": "Allow",
    "Action": ["ec2:DescribeInstances"],
    "Resource": "*"
  },
  {
    "Effect": "Allow",
    "Action": ["ssm:SendCommand", "ssm:GetCommandInvocation"],
    "Resource": "*"
  },
  {
    "Effect": "Allow",
    "Action": ["secretsmanager:GetSecretValue"],
    "Resource": "arn:aws:secretsmanager:{region}:{account}:secret:/minecraft/*"
  },
  {
    "Effect": "Allow",
    "Action": ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"],
    "Resource": "arn:aws:logs:{region}:{account}:log-group:/minecraft/lambda/command-processor:*"
  }
]
```

#### EC2 IAM Instance Profile

```json
[
  "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore",
  {
    "Effect": "Allow",
    "Action": ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"],
    "Resource": "arn:aws:logs:{region}:{account}:log-group:/minecraft/ec2/*"
  }
]
```

### 4.6 Secrets Manager

| シークレット名 | 内容 | アクセス元 | 備考 |
|--------------|------|-----------|------|
| `/minecraft/discord-token` | Discord Bot Token | 処理 Lambda | 手動設定 |
| `/minecraft/discord-public-key` | Discord Public Key | 受付 Lambda | 手動設定 |
| `/minecraft/discord-application-id` | Discord Application ID | 両 Lambda | 手動設定 |
| `/minecraft/rcon-password` | RCON パスワード | EC2 (Ansible配置) | 任意の強力なパスワードを手動設定 |

### 4.7 CloudWatch Logs 設計

| ロググループ | ソース | 保持期間 |
|------------|--------|---------|
| `/minecraft/lambda/discord-handler` | 受付 Lambda | 14日 |
| `/minecraft/lambda/command-processor` | 処理 Lambda | 14日 |
| `/minecraft/ec2/minecraft-server` | Minecraft サーバーログ | 30日 |
| `/minecraft/ec2/system` | systemd ジャーナル | 14日 |

---

## 5. コマンド仕様

### 5.1 共通フロー

```
Discord → 受付Lambda → 即座に ACK (type:5) → Discord に「処理中...」表示
                    → 処理Lambda を非同期 Invoke
                         ↓ 処理完了
                    Discord follow-up webhook で結果送信
```

### 5.2 /mc start

```
1. EC2 DescribeInstances で現在の状態を確認
2. 状態が "running" → follow-up: "✅ サーバーは既に起動中です" → 終了
3. 状態が "stopped" → StartInstances 呼び出し
4. EC2 が "running" になるまでポーリング（10秒間隔、最大 3分）
   - タイムアウト → follow-up: "⚠️ EC2起動タイムアウト" → 終了
5. SSM で mc-status 実行（サーバーが既に起動しているか確認）
6. Minecraft サーバーが停止中 → SSM で mc-start 実行
7. follow-up: "✅ サーバーを起動しました\n接続先: {Elastic IP}:25565"
```

### 5.3 /mc stop

```
1. EC2 DescribeInstances で現在の状態を確認
2. 状態が "stopped" → follow-up: "✅ サーバーは既に停止中です" → 終了
3. 状態が "running" →
   a. SSM で mc-stop 実行（Minecraft を安全にシャットダウン）
   b. SSM コマンド完了を待機（最大 60秒）
   c. StopInstances 呼び出し
4. follow-up: "✅ サーバーを停止しました"
```

### 5.4 /mc status

```
1. EC2 DescribeInstances で現在の状態を確認
2. 状態が "running" →
   a. SSM で mc-status 実行
   b. 結果をパース
3. follow-up: EC2状態 + Minecraft状態 + 接続先IP（起動時のみ）
```

### 5.5 エラーハンドリング（全コマンド共通）

- すべての処理を try-catch で囲む
- AWS API エラー、SSM コマンド失敗、タイムアウトのいずれの場合も
  follow-up webhook で Discord にエラーメッセージを送信する
- エラー時は必ず CloudWatch Logs に詳細を記録する

---

## 6. Lambda インターフェース定義

### 6.1 受付 Lambda → 処理 Lambda ペイロード

```typescript
interface CommandPayload {
  commandName: 'start' | 'stop' | 'status';  // コマンド種別
  applicationId: string;                       // Discord Application ID
  interactionToken: string;                    // follow-up webhook に使用
  userId: string;                              // 実行したユーザーのDiscord ID
}
```

### 6.2 SSM ヘルパー擬似コード

```typescript
// SSMコマンド実行と結果待機のパターン
async function runSSMCommand(instanceId: string, command: string): Promise<string> {
  // 1. SendCommand でコマンド送信
  const sendResult = await ssm.sendCommand({
    InstanceIds: [instanceId],
    DocumentName: 'AWS-RunShellScript',
    Parameters: { commands: [command] }
  });
  const commandId = sendResult.Command.CommandId;

  // 2. GetCommandInvocation でポーリング（2秒間隔、最大30回 = 60秒）
  for (let i = 0; i < 30; i++) {
    await sleep(2000);
    const result = await ssm.getCommandInvocation({
      CommandId: commandId,
      InstanceId: instanceId
    });
    if (result.Status === 'Success') return result.StandardOutputContent;
    if (['Failed', 'Cancelled', 'TimedOut'].includes(result.Status)) {
      throw new Error(`SSM command failed: ${result.Status}`);
    }
  }
  throw new Error('SSM command polling timeout');
}
```

### 6.3 Discord follow-up webhook 送信

```typescript
// follow-up webhook の送信パターン
async function sendFollowup(applicationId: string, token: string, content: string): Promise<void> {
  const url = `https://discord.com/api/v10/webhooks/${applicationId}/${token}`;
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content })
  });
}
```

---

## 7. Ansible 設計

### 7.1 Role 構成

```
infra/ansible/
├── site.yml
├── inventory/
│   └── hosts.yml
├── group_vars/
│   └── all.yml
└── roles/
    ├── common/           # OS基本設定、minecraft ユーザー作成
    ├── java/             # Java 21 (Amazon Corretto) インストール
    ├── linuxgsm/         # LinuxGSM インストール・設定
    ├── minecraft/        # server.properties, RCON設定, systemd unit
    ├── wrapper-scripts/  # /usr/local/bin/mc-* スクリプト配置
    └── monitoring/       # CloudWatch Agent 設定
```

### 7.2 Ansible 変数 (inventory/production/group_vars/all.yml)

```yaml
# ユーザー・パス
minecraft_user: minecraft
minecraft_home: /home/minecraft
linuxgsm_dir: "{{ minecraft_home }}/linuxgsm"
minecraft_server_dir: "{{ linuxgsm_dir }}/serverfiles"

# サーバー設定
minecraft_version: "1.21.4"
minecraft_port: 25565
# t4g.medium (4GB RAM) 向けヒープ設定
# OS + JVM非ヒープ (~800MB) を除いた残りをヒープに割り当て
# MODパック利用時は t4g.large に変更し minecraft_memory_max: "6G" へ
minecraft_memory_max: "2500M"
minecraft_memory_min: "1G"

# RCON設定
rcon_port: 25575
rcon_password: "{{ lookup('aws_ssm', '/minecraft/rcon-password', region='ap-northeast-1') }}"

# ラッパースクリプト
wrapper_scripts_dir: /usr/local/bin

# CloudWatch Logs
cloudwatch_log_group_prefix: /minecraft/ec2
aws_region: ap-northeast-1
```

### 7.3 SSMラッパースクリプト仕様

すべて `/usr/local/bin/` に配置。`chmod 755`。root 実行時に `sudo -u minecraft` でユーザー切り替え。

#### mc-start

```bash
#!/bin/bash
set -euo pipefail
sudo -u minecraft /home/minecraft/linuxgsm/mcserver start
echo "STATUS:OK"
```

#### mc-stop

```bash
#!/bin/bash
set -euo pipefail
sudo -u minecraft /home/minecraft/linuxgsm/mcserver stop
echo "STATUS:OK"
```

#### mc-status

```bash
#!/bin/bash
set -euo pipefail
sudo -u minecraft /home/minecraft/linuxgsm/mcserver details 2>&1 || true
echo "STATUS:OK"
```

#### mc-command（将来用 - 空ファイルとして配置）

```bash
#!/bin/bash
set -euo pipefail
# TODO: 将来の /mc cmd 実装時にここを実装する
# COMMAND="$1"
# RCON_PASSWORD=$(cat /home/minecraft/.rcon_password)
# mcrcon -H 127.0.0.1 -P 25575 -p "$RCON_PASSWORD" "$COMMAND"
echo "STATUS:NOT_IMPLEMENTED"
exit 1
```

### 7.4 server.properties テンプレートの重要設定

```properties
# RCON設定（必須）
enable-rcon=true
rcon.port=25575
rcon.password={{ rcon_password }}
server-ip=127.0.0.1   # localhost のみリッスン

# 基本設定
server-port={{ minecraft_port }}
max-players=20
motd=Minecraft Server

# eula は eula.txt で true に設定すること
```

---

## 8. ディレクトリ構成

```
minecraft-discord-server/
├── infra/
│   ├── cdk/
│   │   ├── bin/
│   │   │   └── app.ts                  # CDK App エントリーポイント
│   │   ├── lib/
│   │   │   ├── network-stack.ts        # Security Group, Elastic IP
│   │   │   ├── compute-stack.ts        # EC2, IAM Instance Profile
│   │   │   └── lambda-stack.ts         # Lambda x2, Function URL, Secrets
│   │   ├── cdk.json
│   │   ├── tsconfig.json
│   │   └── package.json
│   └── ansible/
│       ├── site.yml
│       ├── inventory/
│       │   └── hosts.yml
│       ├── group_vars/
│       │   └── all.yml
│       └── roles/
│           ├── common/
│           ├── java/
│           ├── linuxgsm/
│           ├── minecraft/
│           ├── wrapper-scripts/
│           └── monitoring/
├── services/
│   ├── discord-handler/                # 受付 Lambda
│   │   ├── src/
│   │   │   ├── index.ts               # エントリーポイント
│   │   │   ├── verify.ts              # Discord 署名検証
│   │   │   └── router.ts              # コマンドルーティング → 処理Lambda Invoke
│   │   ├── tsconfig.json
│   │   └── package.json
│   ├── command-processor/              # 処理 Lambda
│   │   ├── src/
│   │   │   ├── index.ts               # エントリーポイント
│   │   │   ├── commands/
│   │   │   │   ├── start.ts
│   │   │   │   ├── stop.ts
│   │   │   │   └── status.ts
│   │   │   ├── aws/
│   │   │   │   ├── ec2.ts             # EC2操作ヘルパー
│   │   │   │   └── ssm.ts             # SSM操作ヘルパー（ポーリング含む）
│   │   │   └── discord/
│   │   │       └── followup.ts        # follow-up webhook 送信
│   │   ├── tsconfig.json
│   │   └── package.json
│   └── shared/                         # 共通型定義・設定
│       ├── src/
│       │   ├── types.ts               # CommandPayload 等の型定義
│       │   └── config.ts              # 環境変数読み取り・バリデーション
│       ├── tsconfig.json
│       └── package.json
├── docs/
│   ├── architecture.md                 # アーキテクチャ・責務分離説明
│   ├── setup.md                        # 詳細セットアップ手順
│   └── commands.md                     # コマンド一覧
├── .gitignore
├── package.json                        # npm workspaces 設定
├── tsconfig.base.json
└── README.md                           # クイックスタート
```

---

## 9. 環境変数

### 受付 Lambda

| 変数名 | 説明 |
|--------|------|
| `DISCORD_PUBLIC_KEY_SECRET_ARN` | Secrets Manager ARN (discord-public-key) |
| `DISCORD_APP_ID_SECRET_ARN` | Secrets Manager ARN (discord-application-id) |
| `PROCESSOR_FUNCTION_NAME` | 処理 Lambda の関数名 |

### 処理 Lambda

| 変数名 | 説明 |
|--------|------|
| `EC2_INSTANCE_ID` | 操作対象 EC2 の Instance ID |
| `DISCORD_TOKEN_SECRET_ARN` | Secrets Manager ARN (discord-token) |
| `DISCORD_APP_ID_SECRET_ARN` | Secrets Manager ARN (discord-application-id) |

---

## 10. 使用ライブラリ

### discord-handler (受付 Lambda)

```json
{
  "dependencies": {
    "discord-interactions": "^3.4.0",
    "@aws-sdk/client-lambda": "^3.0.0",
    "@aws-sdk/client-secrets-manager": "^3.0.0"
  }
}
```

### command-processor (処理 Lambda)

```json
{
  "dependencies": {
    "@aws-sdk/client-ec2": "^3.0.0",
    "@aws-sdk/client-ssm": "^3.0.0",
    "@aws-sdk/client-secrets-manager": "^3.0.0"
  }
}
```

---

## 11. 手動で行う前提作業（AIエージェントでは実行不可）

以下は **デプロイ前に人間が手動で実施する**。

1. **AWS アカウント・CLI 設定**
   - `aws configure` または IAM Identity Center 設定
   - デプロイ先リージョンの確認

2. **CDK Bootstrap**
   ```bash
   cdk bootstrap aws://{ACCOUNT_ID}/{REGION}
   ```

3. **Discord Developer Portal 設定**
   - https://discord.com/developers/applications でアプリを作成
   - 以下を取得してメモ:
     - `APPLICATION_ID`
     - `PUBLIC_KEY`
     - `BOT_TOKEN`
   - Slash Command 登録:
     ```
     /mc start  - Minecraftサーバーを起動します
     /mc stop   - Minecraftサーバーを停止します
     /mc status - サーバーの状態を確認します
     ```

4. **Secrets Manager に値を登録**
   ```bash
   aws secretsmanager put-secret-value --secret-id /minecraft/discord-token      --secret-string "YOUR_BOT_TOKEN"
   aws secretsmanager put-secret-value --secret-id /minecraft/discord-public-key --secret-string "YOUR_PUBLIC_KEY"
   aws secretsmanager put-secret-value --secret-id /minecraft/discord-application-id --secret-string "YOUR_APP_ID"
   aws secretsmanager put-secret-value --secret-id /minecraft/rcon-password      --secret-string "YOUR_STRONG_RCON_PASSWORD"
   ```

5. **Discord の Interactions Endpoint URL 設定**
   - CDK デプロイ後に Lambda Function URL が生成される
   - Discord Developer Portal の「Interactions Endpoint URL」に設定
   - Discord 側で疎通確認（PING/PONG）

---

## 12. 各フェーズの検証基準

| フェーズ | 完了条件 |
|---------|---------|
| CDK (Phase 2-4) | `cdk synth` 成功。SG・EBS・IAMポリシーを目視確認 |
| Lambda (Phase 5-7) | TypeScript コンパイル成功。単体テスト全通過 |
| Ansible (Phase 8-10) | `ansible-playbook --check` エラーなし |
| EC2実機 | `mc-status`, `mc-start`, `mc-stop` がSSMから実行できる |
| 結合 | Discordから3コマンド全て正常動作 |

---

## 13. 将来拡張 TODO

以下は PoC 完成後に実装予定。コード内にも `// TODO:` コメントを残すこと。

| 機能 | 概要 | 追加が必要なもの |
|-----|------|---------------|
| `/mc cmd <command>` | Minecraftコマンドを直接実行 | mc-command スクリプト実装、RCON クライアント、Lambda コマンドハンドラ追加 |
| `/mc backup` | ワールドをS3に手動バックアップ | S3バケット (CDK)、mc-backup スクリプト、Lambda ハンドラ |
| `/mc debug` | ログ・状態情報を収集 | ログ収集スクリプト、長文時S3アップロード→URL返却パターン |
| プレイヤー通知 | ログイン/ログアウトをDiscordに通知 | CloudWatch Logs サブスクリプション → Lambda → Discord Webhook |
| 自動停止 | アイドル時間が一定以上で自動停止 | EventBridge Scheduler、プレイヤー数確認スクリプト |
| 複数サーバー対応 | サーバーを複数管理 | DynamoDB でサーバーメタデータ管理、コマンドに `--server` オプション追加 |

---

## 14. セキュリティチェックリスト

デプロイ前に以下を確認すること。

- [ ] Security Group に RCON ポート (25575) の Inbound ルールがないこと
- [ ] server.properties の `server-ip` が `127.0.0.1` に設定されていること
- [ ] Secrets Manager にシークレット値が正しく設定されていること
- [ ] Lambda IAM Role が最小権限になっていること（`ec2:*` 等の広すぎる権限がないこと）
- [ ] `.gitignore` にシークレット・認証情報ファイルが含まれていること
- [ ] EBS の `deleteOnTermination` が `false` であること（ワールドデータ保護）
- [ ] Discord 署名検証が受付 Lambda の最初の処理として実装されていること
