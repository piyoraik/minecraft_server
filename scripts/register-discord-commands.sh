#!/bin/bash
set -euo pipefail

readonly AWS_REGION="${AWS_REGION:-ap-northeast-1}"
readonly DISCORD_APPLICATION_ID_SECRET_ID="${DISCORD_APPLICATION_ID_SECRET_ID:-/minecraft/discord-application-id}"
readonly DISCORD_BOT_TOKEN_SECRET_ID="${DISCORD_BOT_TOKEN_SECRET_ID:-/minecraft/discord-token}"

resolve_secret_value() {
  local secret_id="$1"

  aws secretsmanager get-secret-value \
    --secret-id "${secret_id}" \
    --region "${AWS_REGION}" \
    --query SecretString \
    --output text
}

if [[ -z "${DISCORD_APPLICATION_ID:-}" ]]; then
  DISCORD_APPLICATION_ID="$(resolve_secret_value "${DISCORD_APPLICATION_ID_SECRET_ID}")"
fi

if [[ -z "${DISCORD_BOT_TOKEN:-}" ]]; then
  DISCORD_BOT_TOKEN="$(resolve_secret_value "${DISCORD_BOT_TOKEN_SECRET_ID}")"
fi

if [[ -z "${DISCORD_APPLICATION_ID}" ]]; then
  echo "DISCORD_APPLICATION_ID is required" >&2
  exit 1
fi

if [[ -z "${DISCORD_BOT_TOKEN}" ]]; then
  echo "DISCORD_BOT_TOKEN is required" >&2
  exit 1
fi

readonly API_BASE="https://discord.com/api/v10/applications/${DISCORD_APPLICATION_ID}/commands"

curl \
  --fail \
  --silent \
  --show-error \
  --request PUT \
  --url "${API_BASE}" \
  --header "Authorization: Bot ${DISCORD_BOT_TOKEN}" \
  --header "Content-Type: application/json" \
  --data @- <<'EOF'
[
  {
    "name": "mc",
    "description": "Minecraft server operations",
    "options": [
      {
        "type": 1,
        "name": "start",
        "description": "Minecraftサーバーを起動します"
      },
      {
        "type": 1,
        "name": "stop",
        "description": "Minecraftサーバーを停止します"
      },
      {
        "type": 1,
        "name": "status",
        "description": "サーバーの状態を確認します"
      },
      {
        "type": 1,
        "name": "restore",
        "description": "停止中サーバーへ latest backup を復元します"
      },
      {
        "type": 1,
        "name": "cmd",
        "description": "許可されたMinecraftコマンドを実行します",
        "options": [
          {
            "type": 3,
            "name": "command",
            "description": "例: list, say hello, save-all",
            "required": true
          }
        ]
      },
      {
        "type": 2,
        "name": "whitelist",
        "description": "ホワイトリストを管理します",
        "options": [
          {
            "type": 1,
            "name": "add",
            "description": "プレイヤーを whitelist に追加します",
            "options": [
              {
                "type": 3,
                "name": "player",
                "description": "Minecraft プレイヤー名",
                "required": true
              }
            ]
          },
          {
            "type": 1,
            "name": "remove",
            "description": "プレイヤーを whitelist から削除します",
            "options": [
              {
                "type": 3,
                "name": "player",
                "description": "Minecraft プレイヤー名",
                "required": true
              }
            ]
          },
          {
            "type": 1,
            "name": "list",
            "description": "whitelist を表示します"
          },
          {
            "type": 1,
            "name": "on",
            "description": "whitelist を有効化します"
          },
          {
            "type": 1,
            "name": "off",
            "description": "whitelist を無効化します"
          }
        ]
      },
      {
        "type": 2,
        "name": "admin",
        "description": "管理者権限を操作します",
        "options": [
          {
            "type": 1,
            "name": "grant",
            "description": "プレイヤーに管理者権限を付与します",
            "options": [
              {
                "type": 3,
                "name": "player",
                "description": "Minecraft プレイヤー名",
                "required": true
              }
            ]
          },
          {
            "type": 1,
            "name": "revoke",
            "description": "プレイヤーから管理者権限を剥奪します",
            "options": [
              {
                "type": 3,
                "name": "player",
                "description": "Minecraft プレイヤー名",
                "required": true
              }
            ]
          }
        ]
      },
      {
        "type": 2,
        "name": "gamemode",
        "description": "デフォルトのゲームモードを変更します",
        "options": [
          {
            "type": 1,
            "name": "survival",
            "description": "survival に変更します"
          },
          {
            "type": 1,
            "name": "creative",
            "description": "creative に変更します"
          },
          {
            "type": 1,
            "name": "adventure",
            "description": "adventure に変更します"
          },
          {
            "type": 1,
            "name": "spectator",
            "description": "spectator に変更します"
          }
        ]
      },
      {
        "type": 2,
        "name": "playtime",
        "description": "プレイ時間を確認します",
        "options": [
          {
            "type": 1,
            "name": "player",
            "description": "指定プレイヤーのプレイ時間を表示します",
            "options": [
              {
                "type": 3,
                "name": "player",
                "description": "Minecraft プレイヤー名",
                "required": true
              }
            ]
          },
          {
            "type": 1,
            "name": "top",
            "description": "プレイ時間ランキングを表示します"
          }
        ]
      }
    ]
  }
]
EOF
