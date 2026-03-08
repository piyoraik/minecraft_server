#!/bin/bash
set -euo pipefail

readonly AWS_REGION="${AWS_REGION:-ap-northeast-1}"
readonly AWS_CLI_BIN="${AWS_CLI_BIN:-aws}"
readonly COMPUTE_STACK_NAME="${COMPUTE_STACK_NAME:-Compute}"
readonly LAMBDA_STACK_NAME="${LAMBDA_STACK_NAME:-Lambda}"
readonly RCON_SECRET_ID="${RCON_SECRET_ID:-/minecraft/rcon-password}"
readonly WORKDIR="/Users/s-tanaka/work/minecraft"
readonly ANSIBLE_GALAXY_CMD="${ANSIBLE_GALAXY_CMD:-ansible-galaxy}"
readonly ANSIBLE_PLAYBOOK_CMD="${ANSIBLE_PLAYBOOK_CMD:-ansible-playbook}"

get_stack_output() {
  local stack_name="$1"
  local output_key="$2"

  "${AWS_CLI_BIN}" cloudformation describe-stacks \
    --stack-name "${stack_name}" \
    --region "${AWS_REGION}" \
    --query "Stacks[0].Outputs[?OutputKey=='${output_key}'].OutputValue | [0]" \
    --output text
}

get_secret_value() {
  local secret_id="$1"

  "${AWS_CLI_BIN}" secretsmanager get-secret-value \
    --secret-id "${secret_id}" \
    --region "${AWS_REGION}" \
    --query SecretString \
    --output text
}

require_command() {
  local command_name="$1"

  if ! command -v "${command_name}" >/dev/null 2>&1; then
    echo "Required command not found: ${command_name}" >&2
    exit 1
  fi
}

require_python_module() {
  local module_name="$1"
  local python_bin="$2"

  if ! "${python_bin}" -c "import ${module_name}" >/dev/null 2>&1; then
    echo "Required Python module not found: ${module_name}" >&2
    echo "Ansible is using: ${python_bin}" >&2
    echo "Install it into the same environment, for example:" >&2
    echo "  uv add ansible-core boto3 botocore" >&2
    echo "or point ANSIBLE_PLAYBOOK_CMD/ANSIBLE_GALAXY_CMD at an environment that already has boto3." >&2
    exit 1
  fi
}

get_ansible_python() {
  eval "${ANSIBLE_PLAYBOOK_CMD}" --version | awk -F '[()]' '/^  python version = / { print $(NF-1); exit }'
}

if [[ -z "${MINECRAFT_INSTANCE_ID:-}" ]]; then
  MINECRAFT_INSTANCE_ID="$(get_stack_output "${COMPUTE_STACK_NAME}" "InstanceId")"
fi

if [[ -z "${MINECRAFT_SSM_BUCKET:-}" ]]; then
  MINECRAFT_SSM_BUCKET="$(get_stack_output "${LAMBDA_STACK_NAME}" "AnsibleSsmBucketName")"
fi

if [[ -z "${MINECRAFT_RCON_PASSWORD:-}" ]]; then
  MINECRAFT_RCON_PASSWORD="$(get_secret_value "${RCON_SECRET_ID}")"
fi

if [[ -z "${MINECRAFT_INSTANCE_ID}" || "${MINECRAFT_INSTANCE_ID}" == "None" ]]; then
  echo "Failed to resolve MINECRAFT_INSTANCE_ID from ${COMPUTE_STACK_NAME}" >&2
  exit 1
fi

if [[ -z "${MINECRAFT_SSM_BUCKET}" || "${MINECRAFT_SSM_BUCKET}" == "None" ]]; then
  echo "Failed to resolve MINECRAFT_SSM_BUCKET from ${LAMBDA_STACK_NAME}" >&2
  exit 1
fi

if [[ -z "${MINECRAFT_RCON_PASSWORD}" || "${MINECRAFT_RCON_PASSWORD}" == "None" ]]; then
  echo "Failed to resolve MINECRAFT_RCON_PASSWORD from ${RCON_SECRET_ID}" >&2
  exit 1
fi

export AWS_REGION
export MINECRAFT_INSTANCE_ID
export MINECRAFT_SSM_BUCKET
export MINECRAFT_RCON_PASSWORD
export OBJC_DISABLE_INITIALIZE_FORK_SAFETY="${OBJC_DISABLE_INITIALIZE_FORK_SAFETY:-YES}"

cd "${WORKDIR}"
require_command session-manager-plugin

ansible_python="$(get_ansible_python)"
if [[ -z "${ansible_python}" ]]; then
  echo "Failed to determine the Python interpreter used by ${ANSIBLE_PLAYBOOK_CMD}" >&2
  exit 1
fi

require_python_module boto3 "${ansible_python}"
eval "${ANSIBLE_GALAXY_CMD}" collection install -r infra/ansible/collections/requirements.yml

playbook_args=()
for arg in "$@"; do
  playbook_args+=("$(printf '%q' "${arg}")")
done

if [[ ${#playbook_args[@]} -eq 0 ]]; then
  eval "${ANSIBLE_PLAYBOOK_CMD}" -i infra/ansible/inventory/production/hosts.yml infra/ansible/site.yml
else
  eval "${ANSIBLE_PLAYBOOK_CMD}" -i infra/ansible/inventory/production/hosts.yml infra/ansible/site.yml "${playbook_args[*]}"
fi
