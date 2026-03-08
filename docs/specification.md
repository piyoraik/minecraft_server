# Minecraft Discord 管理システム 実装仕様書 vCurrent

> **改訂履歴**
> - v1: 初版
> - v2: Discord 受付 / 処理 Lambda の 2 段構成を導入
> - vCurrent: 2026-03-08 時点の実装へ全面追従
>   - `t3.medium` / x86_64 構成へ更新
>   - `player-event-processor` と DynamoDB 集計を反映
>   - `/mc restore` の確認 UI と restore 後再起動を反映
>   - S3 backup / restore の現在仕様を反映
>   - Ansible / CDK の現行ディレクトリ構成へ更新

---

## 1. 概要・目的

Discord の slash command から Minecraft サーバー用 EC2 を起動・停止し、起動中は Minecraft の管理コマンドを実行できるシステム。

現在の主な対象機能:
- `/mc start` `/mc stop` `/mc status`
- `/mc restore`
- `/mc cmd`
- `/mc whitelist`
- `/mc admin`
- `/mc gamemode`
- `/mc playtime`
- プレイヤー入退室通知
- `/mc stop` 時の S3 backup

---

## 2. 技術スタック

| レイヤー | 技術 | 役割 |
|---------|------|------|
| IaC | AWS CDK (TypeScript) | AWS リソース定義 |
| EC2 構成管理 | Ansible | EC2 内のあるべき状態を構成 |
| サーバー管理 | LinuxGSM | Minecraft サーバープロセス管理 |
| コマンド実行 | wrapper script + SSM RunCommand | EC2 内操作の統一入口 |
| API (受付) | Lambda (TypeScript) | Discord 署名検証・即時応答 |
| API (処理) | Lambda (TypeScript) | EC2 / SSM / Discord follow-up |
| イベント処理 | Lambda (TypeScript) | join / leave 集計と通知 |
| データ保存 | DynamoDB | プレイ時間集計 |
| バックアップ | S3 | `serverfiles` backup 保存 |
| シークレット | AWS Secrets Manager | Discord / RCON / Webhook 管理 |

### 設計方針

| コンポーネント | 担当範囲 | 担当しないこと |
|--------------|---------|----------------|
| CDK | AWS リソース定義 | EC2 内設定 |
| Ansible | EC2 内設定 | AWS リソース作成 |
| Lambda | Discord / AWS API 呼び出し | EC2 内ファイルの直接編集 |
| SSM | wrapper script 呼び出し | 構成管理 |
| LinuxGSM | Minecraft 起動停止 | AWS 操作 |

---

## 3. アーキテクチャ

### 全体構成図

```text
Discord
  │
  │ Slash Command / Button Interaction
  ▼
Lambda Function URL
  │
  ▼
┌──────────────────────────────────────────┐
│ 受付 Lambda (discord-handler)             │
│  1. Discord 署名検証                      │
│  2. PING → PONG                           │
│  3. 通常 command → ACK                    │
│  4. /mc restore → 確認 UI を返す          │
│  5. Confirm button → 処理 Lambda を invoke │
└─────────────────┬────────────────────────┘
                  │ Lambda Invoke (async)
                  ▼
┌──────────────────────────────────────────┐
│ 処理 Lambda (command-processor)           │
│  1. EC2 状態確認                          │
│  2. EC2 start / stop                      │
│  3. SSM RunCommand                        │
│  4. Discord follow-up 送信                │
└───────────────┬──────────────────────────┘
                │
                ▼
┌──────────────────────────────────────────┐
│ EC2 (Amazon Linux 2023)                  │
│  LinuxGSM                                │
│  Minecraft Server                        │
│  /usr/local/bin/mc-*                     │
│  CloudWatch Agent                        │
└───────┬─────────────────────────┬────────┘
        │                         │
        │ CloudWatch Logs         │ SSM RunCommand
        ▼                         ▼
┌───────────────────────┐   ┌───────────────────────┐
│ player-event-processor│   │ wrapper scripts       │
│  join/leave を集計     │   │ mc-start / mc-stop    │
│  DynamoDB 更新         │   │ mc-backup / mc-restore│
│  Discord Webhook 通知  │   └───────────────────────┘
└──────────┬────────────┘
           │
           ▼
   DynamoDB / Discord Webhook

Secrets Manager
  ├─ /minecraft/discord-token
  ├─ /minecraft/discord-public-key
  ├─ /minecraft/discord-application-id
  ├─ /minecraft/rcon-password
  └─ /minecraft/player-event-webhook-url

S3
  └─ AnsibleSsmBucket
     ├─ aws_ssm connection 用の転送領域
     └─ world-backups/latest.tar.gz などの backup
```

### Discord インタラクション 3 秒制限への対応

Discord Interaction API には短い応答制限があるため、受付と実処理を分ける。

- `discord-handler`
  - 署名検証
  - 即時応答
  - 非同期 invoke
- `command-processor`
  - 時間のかかる EC2 / SSM 操作
  - follow-up 送信

---

## 4. AWS 設計

### 4.1 EC2 仕様

| 項目 | 値 |
|-----|---|
| AMI | Amazon Linux 2023 最新 |
| アーキテクチャ | x86_64 |
| インスタンスタイプ | `t3.medium` |
| vCPU / RAM | 2 vCPU / 4 GB |
| EBS | 30GB gp3 |
| EBS 暗号化 | 有効 |
| `deleteOnTermination` | `false` |
| Elastic IP | 割り当てあり |
| SSM Agent | AL2023 既定 |
| Tags | `Project: minecraft-server` を含む標準タグ |

> 注意:
> 旧版仕様書にあった `t4g.medium` / ARM64 は現行実装では採用していない。

### 4.2 Security Group

| 方向 | ポート | プロトコル | ソース | 用途 |
|-----|--------|-----------|--------|------|
| Inbound | 25565 | TCP | 0.0.0.0/0 | Minecraft クライアント接続 |
| Outbound | ALL | ALL | 0.0.0.0/0 | SSM / package / Mojang / S3 など |

補足:
- RCON (`25575`) は Security Group で開けない
- SSH (`22`) も開けない
- 運用接続は Session Manager を前提にする

### 4.3 CDK Stack 分割

```text
Network
  ├─ VPC
  ├─ Security Group
  └─ Elastic IP

Lambda
  ├─ Secrets Manager
  ├─ Lambda LogGroup
  ├─ Discord Handler
  ├─ Command Processor
  ├─ Player Event Processor
  ├─ S3 Bucket
  └─ DynamoDB

Compute
  ├─ EC2 Instance Role
  ├─ EC2 Instance
  └─ Elastic IP Association
```

依存関係:
- `Compute -> Network`
- `Compute -> Lambda`

`Compute` が `Lambda` stack の S3 bucket を backup 用として参照しているため、`Compute -> Lambda` 依存がある。

### 4.4 Lambda 設定

| 項目 | discord-handler | command-processor | player-event-processor |
|-----|-----------------|-------------------|------------------------|
| 関数名 | `minecraft-discord-handler` | `minecraft-command-processor` | `minecraft-player-event-processor` |
| Runtime | Node.js 20.x | Node.js 20.x | Node.js 20.x |
| Timeout | 10 秒 | 300 秒 | 30 秒 |
| Memory | 256 MB | 256 MB | 256 MB |
| 配布 | `aws-lambda-nodejs` bundle | `aws-lambda-nodejs` bundle | `aws-lambda-nodejs` bundle |

`discord-handler` には Function URL (`AuthType.NONE`) を付与する。

### 4.5 IAM

#### `discord-handler`

- `lambda:InvokeFunction` on `minecraft-command-processor`
- `secretsmanager:GetSecretValue`
- CloudWatch Logs 書き込み

#### `command-processor`

- `ec2:StartInstances`, `ec2:StopInstances`
  - `ec2:ResourceTag/Project = minecraft-server` 条件付き
- `ec2:DescribeInstances`
- `ssm:SendCommand`
- `ssm:GetCommandInvocation`
- DynamoDB 読み取り
- CloudWatch Logs 書き込み

#### `player-event-processor`

- DynamoDB 読み書き
- SecretsManager 読み取り
- CloudWatch Logs 書き込み

#### EC2 Instance Role

- `AmazonSSMManagedInstanceCore`
- `/minecraft/ec2/*` への CloudWatch Logs 書き込み
- backup bucket への S3 読み書き

### 4.6 Secrets Manager

| シークレット名 | 用途 |
|--------------|------|
| `/minecraft/discord-token` | slash command 登録 script 用 |
| `/minecraft/discord-public-key` | Discord 署名検証 |
| `/minecraft/discord-application-id` | interaction 処理 / command 登録 |
| `/minecraft/rcon-password` | Ansible から `server.properties` / `mcserver.cfg` へ反映 |
| `/minecraft/player-event-webhook-url` | join / leave 通知先 |

補足:
- `command-processor` は Discord Bot Token を使わず、interaction follow-up webhook を直接呼ぶ

---

## 5. EC2 / Ansible 設計

### 5.1 Playbook 構成

playbook 本体:
- `infra/ansible/playbooks/site.yml`

inventory:
- `infra/ansible/inventory/production/hosts.yml`
- `infra/ansible/inventory/production/group_vars/all.yml`

接続方式:
- `amazon.aws.aws_ssm`

### 5.2 Role 構成

| Role | 役割 |
|------|------|
| `common` | ユーザー作成、ディレクトリ作成 |
| `java` | Java 21 Corretto 導入 |
| `linuxgsm` | LinuxGSM 導入と `mcserver` 初期化 |
| `minecraft` | Mojang metadata から jar 取得、設定ファイル配置 |
| `wrapper-scripts` | `mc-*` 配置 |
| `monitoring` | CloudWatch Agent 導入 |

### 5.3 Minecraft 設定

現在の既定値:

| 項目 | 値 |
|-----|---|
| バージョン | `1.21.11` |
| port | `25565` |
| query port | `25565` |
| rcon port | `25575` |
| memory min | `1G` |
| memory max | `2500M` |
| LinuxGSM `javaram` | `2500` |
| max players | `20` |
| MOTD | `Minecraft Server` |
| whitelist | `true` |

`server.properties`:
- `enable-rcon=true`
- `enable-query=true`
- `white-list=true`
- `server-ip=` のまま

### 5.4 CloudWatch Agent

収集対象:
- `{{ minecraft_server_dir }}/logs/latest.log`

送信先 LogGroup:
- `/minecraft/ec2/minecraft-server`

旧仕様書にあった `/minecraft/ec2/system` は現在の実装には存在しない。

---

## 6. Wrapper Script 仕様

配置される script:
- `mc-start`
- `mc-stop`
- `mc-stop-no-backup`
- `mc-status`
- `mc-command`
- `mc-backup`
- `mc-restore`

### 6.1 `mc-stop`

処理順:
1. `save-off`
2. `save-all`
3. LinuxGSM stop
4. `mc-backup`

### 6.2 `mc-backup`

`serverfiles` 全体を tar.gz 化して S3 へ保存する。

保存先:
- bucket: `Lambda` stack の `AnsibleSsmBucket`
- prefix: `world-backups`
- keys:
  - `world-backups/latest.tar.gz`
  - `world-backups/minecraft-serverfiles-<timestamp>.tar.gz`

### 6.3 `mc-restore`

処理順:
1. `latest.tar.gz` の存在確認
2. S3 から archive を取得
3. `serverfiles` 配下を空にする
4. archive を展開

重要:
- restore は破壊的
- `world` だけでなく `serverfiles` 全体を復元する

### 6.4 `mc-stop-no-backup`

restore 前専用の停止処理。

処理順:
1. `save-off`
2. `save-all`
3. LinuxGSM stop

backup を取らない理由:
- `latest.tar.gz` を直前状態で上書きしないため

---

## 7. Discord コマンド仕様

### `/mc start`

- EC2 が stopped なら起動して SSM ready 待ち
- Minecraft が止まっていれば `mc-start`
- 接続先 IP を返す

### `/mc stop`

- `mc-stop`
- DynamoDB 上の online セッションを close
- EC2 stop

### `/mc status`

- EC2 状態を返す
- running のときは `mc-status` を叩き、Minecraft Server Details だけ整形して返す
- RCON password 行は除外する

### `/mc cmd`

許可済み allowlist のみ実行する。

初期 allowlist:
- `list`
- `say ...`
- `save-all`
- `save-on`
- `save-off`
- `time set day|night|noon|midnight`
- `weather clear|rain|thunder`
- `difficulty peaceful|easy|normal|hard`

### `/mc restore`

現在の仕様は次の 2 段階。

1. `/mc restore`
   - 確認用の ephemeral メッセージを返す
   - `Restore を実行` / `キャンセル` ボタンを表示
2. `Restore を実行`
   - 元メッセージを「restore を開始しました」に更新
   - 非同期で restore を実行
   - 完了後、follow-up で結果を返す

restore 実行フロー:

```text
running:
  mc-stop-no-backup
  -> mc-restore
  -> mc-start

stopped:
  EC2 start
  -> wait for SSM
  -> mc-restore
  -> mc-start
```

### whitelist / admin / gamemode / playtime

- `whitelist`
  - `add/remove/list/on/off`
- `admin`
  - `grant/revoke`
- `gamemode`
  - `survival/creative/adventure/spectator`
- `playtime`
  - `player <name>`
  - `top`

---

## 8. プレイヤーイベント集計

`player-event-processor` は CloudWatch Logs subscription から `joined the game` / `left the game` を検出する。

保存先:
- DynamoDB `minecraft-player-stats`

保存項目:
- `playerName`
- `online`
- `totalPlaySeconds`
- `currentSessionStartedAt`
- `lastJoinAt`
- `lastLeaveAt`
- `joinCount`

通知:
- `/minecraft/player-event-webhook-url` の Discord Webhook へ POST

---

## 9. データストア

### 9.1 S3

用途:
- Ansible `aws_ssm` connection の中継
- Minecraft backup 保存先

設定:
- versioning 有効
- S3 managed encryption
- block public access
- `autoDeleteObjects: true`
- removalPolicy は app config 依存

注意:
- `dev` 既定では `RemovalPolicy.DESTROY`
- backup 保存先としては恒久運用向きではない

### 9.2 DynamoDB

テーブル:
- `minecraft-player-stats`

用途:
- プレイ時間集計
- online 状態
- join / leave 履歴

---

## 10. ログ

主要 LogGroup:
- `/minecraft/lambda/discord-handler`
- `/minecraft/lambda/command-processor`
- `/minecraft/lambda/player-event-processor`
- `/minecraft/ec2/minecraft-server`

---

## 11. 開発 / 運用フロー

標準的な反映順:

1. `aws login`
2. `npm install`
3. `npm run typecheck`
4. `npm run test`
5. `make cdk-deploy`
6. Secrets Manager に必要値を投入
7. `make register-commands`
8. Discord Developer Portal に Function URL を設定
9. `make ansible-ssm-op`

主な運用コマンド:
- `make cdk-synth`
- `make cdk-diff`
- `make cdk-deploy`
- `make ansible-ssm`
- `make ansible-ssm-check`
- `make ansible-ssm-op`
- `make ansible-ssm-op-check`
- `make ssm-session`

---

## 12. 現在の注意点

- backup bucket は Ansible SSM 用 bucket と共用している
- restore は `serverfiles` 全体を消して展開するため破壊的
- `Compute` は backup 用 bucket を参照するため `Lambda` stack に依存する
- stopped 状態から `/mc restore` した場合、restore 後は EC2 も Minecraft も起動したままになる
- `dev` 既定では stateful resource も `DESTROY` のため、本番用途では removal policy の見直しが必要

