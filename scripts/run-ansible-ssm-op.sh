#!/bin/bash
set -euo pipefail

readonly WORKDIR="/Users/s-tanaka/work/minecraft"
readonly AWS_REGION="${AWS_REGION:-ap-northeast-1}"
readonly AWS_CLI_BIN="${AWS_CLI_BIN:-aws}"
readonly COMPUTE_STACK_NAME="${COMPUTE_STACK_NAME:-Compute}"
readonly LAMBDA_STACK_NAME="${LAMBDA_STACK_NAME:-Lambda}"
readonly RCON_SECRET_ID="${RCON_SECRET_ID:-/minecraft/rcon-password}"
readonly ANSIBLE_GALAXY_CMD="${ANSIBLE_GALAXY_CMD:-uv run ansible-galaxy}"
readonly ANSIBLE_PLAYBOOK_CMD="${ANSIBLE_PLAYBOOK_CMD:-uv run ansible-playbook}"

require_command() {
  local command_name="$1"
  if ! command -v "${command_name}" >/dev/null 2>&1; then
    echo "Required command not found: ${command_name}" >&2
    exit 1
  fi
}

require_command aws
require_command op

if [[ -z "${AWS_ACCESS_KEY_ID:-}" || -z "${AWS_SECRET_ACCESS_KEY:-}" ]]; then
  if "${AWS_CLI_BIN}" configure export-credentials --help >/dev/null 2>&1; then
    # aws configure export-credentials が使える環境だけ、boto3 向けの認証情報を環境変数へ引き継ぐ。
    eval "$("${AWS_CLI_BIN}" configure export-credentials --format env-no-export)"
  fi
fi

MINECRAFT_INSTANCE_ID="$(
  aws cloudformation describe-stacks \
    --stack-name "${COMPUTE_STACK_NAME}" \
    --region "${AWS_REGION}" \
    --query "Stacks[0].Outputs[?OutputKey=='InstanceId'].OutputValue | [0]" \
    --output text
)"

MINECRAFT_SSM_BUCKET="$(
  aws cloudformation describe-stacks \
    --stack-name "${LAMBDA_STACK_NAME}" \
    --region "${AWS_REGION}" \
    --query "Stacks[0].Outputs[?OutputKey=='AnsibleSsmBucketName'].OutputValue | [0]" \
    --output text
)"

MINECRAFT_RCON_PASSWORD="$(
  aws secretsmanager get-secret-value \
    --secret-id "${RCON_SECRET_ID}" \
    --region "${AWS_REGION}" \
    --query SecretString \
    --output text
)"

cd "${WORKDIR}"

env_args=(
  "AWS_REGION=${AWS_REGION}"
  "MINECRAFT_INSTANCE_ID=${MINECRAFT_INSTANCE_ID}"
  "MINECRAFT_SSM_BUCKET=${MINECRAFT_SSM_BUCKET}"
  "MINECRAFT_RCON_PASSWORD=${MINECRAFT_RCON_PASSWORD}"
  "ANSIBLE_GALAXY_CMD=${ANSIBLE_GALAXY_CMD}"
  "ANSIBLE_PLAYBOOK_CMD=${ANSIBLE_PLAYBOOK_CMD}"
)

if [[ -n "${AWS_ACCESS_KEY_ID:-}" && -n "${AWS_SECRET_ACCESS_KEY:-}" ]]; then
  env_args+=("AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID}")
  env_args+=("AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY}")
fi

if [[ -n "${AWS_SESSION_TOKEN:-}" ]]; then
  env_args+=("AWS_SESSION_TOKEN=${AWS_SESSION_TOKEN}")
fi

op run -- env "${env_args[@]}" /Users/s-tanaka/work/minecraft/scripts/run-ansible-ssm.sh "$@"
