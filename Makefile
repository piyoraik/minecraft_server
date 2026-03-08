ROOT_DIR := $(dir $(abspath $(lastword $(MAKEFILE_LIST))))
VENV_BIN := $(ROOT_DIR).venv/bin
CDK_DIR := $(ROOT_DIR)infra/cdk
ANSIBLE_ROLES_DIR := $(ROOT_DIR)infra/ansible/roles
ANSIBLE_CONFIG_FILE := $(ROOT_DIR)infra/ansible/ansible.cfg

AWS_REGION ?= ap-northeast-1
AWS_ACCOUNT_ID ?=
AWS_CLI_BIN ?= aws
COMPUTE_STACK_NAME ?= Compute
LAMBDA_STACK_NAME ?= Lambda
RCON_SECRET_ID ?= /minecraft/rcon-password
DISCORD_APPLICATION_ID_SECRET_ID ?= /minecraft/discord-application-id
DISCORD_BOT_TOKEN_SECRET_ID ?= /minecraft/discord-token
CDK_STACKS ?= Network Compute Lambda
CDK_CLI ?= npx aws-cdk
ifneq ("$(wildcard $(VENV_BIN)/ansible-galaxy)","")
ANSIBLE_GALAXY_CMD ?= $(VENV_BIN)/ansible-galaxy
else
ANSIBLE_GALAXY_CMD ?= ansible-galaxy
endif
ifneq ("$(wildcard $(VENV_BIN)/ansible-playbook)","")
ANSIBLE_PLAYBOOK_CMD ?= $(VENV_BIN)/ansible-playbook
else
ANSIBLE_PLAYBOOK_CMD ?= ansible-playbook
endif
SESSION_INSTANCE_ID ?=

.PHONY: help aws-check install build typecheck test lint cdk-build cdk-typecheck cdk-test cdk-lint cdk-synth cdk-diff cdk-deploy register-commands ansible-ssm ansible-ssm-check ansible-ssm-op ansible-ssm-op-check ssm-session ansible-lint yaml-lint ansible-syntax-check molecule-test

help:
	@printf '%s\n' \
		'aws-check            AWS CLI の認証状態を確認する' \
		'install              npm install を実行する' \
		'build                workspace 全体を build する' \
		'typecheck            workspace 全体を typecheck する' \
		'test                 workspace 全体の test を実行する' \
		'lint                 workspace 全体の lint を実行する' \
		'cdk-build            infra/cdk を build する' \
		'cdk-typecheck        infra/cdk を typecheck する' \
		'cdk-test             infra/cdk の test を実行する' \
		'cdk-lint             infra/cdk の lint を実行する' \
		'cdk-synth            infra/cdk を synth する' \
		'cdk-diff             infra/cdk の差分を確認する' \
		'cdk-deploy           infra/cdk を deploy する' \
		'register-commands    Discord slash command を再登録する' \
		'ansible-ssm          Session Manager 経由で Ansible を実行する' \
		'ansible-ssm-check    Ansible を check mode で実行する' \
		'ansible-ssm-op       1Password の aws ラッパー併用で Ansible を実行する' \
		'ansible-ssm-op-check ansible-ssm-op を check mode で実行する' \
		'ssm-session          EC2 へ Session Manager 接続する' \
		'yaml-lint            YAML を検証する' \
		'ansible-lint         Ansible を lint する' \
		'ansible-syntax-check Playbook の構文検証をする' \
		'molecule-test        Molecule scenario を実行する'

aws-check:
	@AWS_REGION="$(AWS_REGION)" "$(AWS_CLI_BIN)" sts get-caller-identity

install:
	@npm install

build:
	@npm run build

typecheck:
	@npm run typecheck

test:
	@npm run test

lint:
	@npm run lint

cdk-build:
	@npm run -w infra/cdk build

cdk-typecheck:
	@npm run -w infra/cdk typecheck

cdk-test:
	@npm run -w infra/cdk test

cdk-lint:
	@npm run -w infra/cdk lint

cdk-synth:
	@ACCOUNT_ID="$${CDK_DEFAULT_ACCOUNT:-$(AWS_ACCOUNT_ID)}"; \
	if [ -z "$$ACCOUNT_ID" ]; then \
		ACCOUNT_ID="$$(env AWS_REGION="$(AWS_REGION)" "$(AWS_CLI_BIN)" sts get-caller-identity --query Account --output text 2>/dev/null)"; \
	fi; \
	if [ -z "$$ACCOUNT_ID" ] || [ "$$ACCOUNT_ID" = "None" ]; then \
		echo "CDK 用の AWS account を解決できません。AWS_ACCOUNT_ID か CDK_DEFAULT_ACCOUNT を指定するか、aws login を実行してください。" >&2; \
		exit 1; \
	fi; \
	cd "$(CDK_DIR)" && CDK_DEFAULT_ACCOUNT="$$ACCOUNT_ID" CDK_DEFAULT_REGION="$(AWS_REGION)" AWS_REGION="$(AWS_REGION)" $(CDK_CLI) synth $(CDK_STACKS)

cdk-diff:
	@ACCOUNT_ID="$${CDK_DEFAULT_ACCOUNT:-$(AWS_ACCOUNT_ID)}"; \
	if [ -z "$$ACCOUNT_ID" ]; then \
		ACCOUNT_ID="$$(env AWS_REGION="$(AWS_REGION)" "$(AWS_CLI_BIN)" sts get-caller-identity --query Account --output text 2>/dev/null)"; \
	fi; \
	if [ -z "$$ACCOUNT_ID" ] || [ "$$ACCOUNT_ID" = "None" ]; then \
		echo "CDK 用の AWS account を解決できません。AWS_ACCOUNT_ID か CDK_DEFAULT_ACCOUNT を指定するか、aws login を実行してください。" >&2; \
		exit 1; \
	fi; \
	cd "$(CDK_DIR)" && CDK_DEFAULT_ACCOUNT="$$ACCOUNT_ID" CDK_DEFAULT_REGION="$(AWS_REGION)" AWS_REGION="$(AWS_REGION)" $(CDK_CLI) diff $(CDK_STACKS)

cdk-deploy:
	@ACCOUNT_ID="$${CDK_DEFAULT_ACCOUNT:-$(AWS_ACCOUNT_ID)}"; \
	if [ -z "$$ACCOUNT_ID" ]; then \
		ACCOUNT_ID="$$(env AWS_REGION="$(AWS_REGION)" "$(AWS_CLI_BIN)" sts get-caller-identity --query Account --output text 2>/dev/null)"; \
	fi; \
	if [ -z "$$ACCOUNT_ID" ] || [ "$$ACCOUNT_ID" = "None" ]; then \
		echo "CDK 用の AWS account を解決できません。AWS_ACCOUNT_ID か CDK_DEFAULT_ACCOUNT を指定するか、aws login を実行してください。" >&2; \
		exit 1; \
	fi; \
	cd "$(CDK_DIR)" && CDK_DEFAULT_ACCOUNT="$$ACCOUNT_ID" CDK_DEFAULT_REGION="$(AWS_REGION)" AWS_REGION="$(AWS_REGION)" $(CDK_CLI) deploy $(CDK_STACKS)

register-commands:
	@AWS_REGION="$(AWS_REGION)" \
	AWS_CLI_BIN="$(AWS_CLI_BIN)" \
	DISCORD_APPLICATION_ID_SECRET_ID="$(DISCORD_APPLICATION_ID_SECRET_ID)" \
	DISCORD_BOT_TOKEN_SECRET_ID="$(DISCORD_BOT_TOKEN_SECRET_ID)" \
	"$(ROOT_DIR)scripts/register-discord-commands.sh"

ansible-ssm:
	@AWS_REGION="$(AWS_REGION)" \
	AWS_CLI_BIN="$(AWS_CLI_BIN)" \
	COMPUTE_STACK_NAME="$(COMPUTE_STACK_NAME)" \
	LAMBDA_STACK_NAME="$(LAMBDA_STACK_NAME)" \
	RCON_SECRET_ID="$(RCON_SECRET_ID)" \
	ANSIBLE_GALAXY_CMD="$(ANSIBLE_GALAXY_CMD)" \
	ANSIBLE_PLAYBOOK_CMD="$(ANSIBLE_PLAYBOOK_CMD)" \
	"$(ROOT_DIR)scripts/run-ansible-ssm.sh"

ansible-ssm-check:
	@AWS_REGION="$(AWS_REGION)" \
	AWS_CLI_BIN="$(AWS_CLI_BIN)" \
	COMPUTE_STACK_NAME="$(COMPUTE_STACK_NAME)" \
	LAMBDA_STACK_NAME="$(LAMBDA_STACK_NAME)" \
	RCON_SECRET_ID="$(RCON_SECRET_ID)" \
	ANSIBLE_GALAXY_CMD="$(ANSIBLE_GALAXY_CMD)" \
	ANSIBLE_PLAYBOOK_CMD="$(ANSIBLE_PLAYBOOK_CMD)" \
	"$(ROOT_DIR)scripts/run-ansible-ssm.sh" --check

ansible-ssm-op:
	@AWS_REGION="$(AWS_REGION)" \
	AWS_CLI_BIN="$(AWS_CLI_BIN)" \
	COMPUTE_STACK_NAME="$(COMPUTE_STACK_NAME)" \
	LAMBDA_STACK_NAME="$(LAMBDA_STACK_NAME)" \
	RCON_SECRET_ID="$(RCON_SECRET_ID)" \
	ANSIBLE_GALAXY_CMD="$(ANSIBLE_GALAXY_CMD)" \
	ANSIBLE_PLAYBOOK_CMD="$(ANSIBLE_PLAYBOOK_CMD)" \
	"$(ROOT_DIR)scripts/run-ansible-ssm-op.sh"

ansible-ssm-op-check:
	@AWS_REGION="$(AWS_REGION)" \
	AWS_CLI_BIN="$(AWS_CLI_BIN)" \
	COMPUTE_STACK_NAME="$(COMPUTE_STACK_NAME)" \
	LAMBDA_STACK_NAME="$(LAMBDA_STACK_NAME)" \
	RCON_SECRET_ID="$(RCON_SECRET_ID)" \
	ANSIBLE_GALAXY_CMD="$(ANSIBLE_GALAXY_CMD)" \
	ANSIBLE_PLAYBOOK_CMD="$(ANSIBLE_PLAYBOOK_CMD)" \
	"$(ROOT_DIR)scripts/run-ansible-ssm-op.sh" --check

ssm-session:
	@INSTANCE_ID="$${SESSION_INSTANCE_ID:-$$("$(AWS_CLI_BIN)" cloudformation describe-stacks \
		--stack-name "$(COMPUTE_STACK_NAME)" \
		--region "$(AWS_REGION)" \
		--query "Stacks[0].Outputs[?OutputKey=='InstanceId'].OutputValue | [0]" \
		--output text)}"; \
	"$(AWS_CLI_BIN)" ssm start-session --target "$$INSTANCE_ID" --region "$(AWS_REGION)"

yaml-lint:
	@uv run yamllint .

ansible-lint:
	@ANSIBLE_CONFIG="$(ANSIBLE_CONFIG_FILE)" uv run ansible-lint infra/ansible

ansible-syntax-check:
	@AWS_REGION="$(AWS_REGION)" \
	MINECRAFT_INSTANCE_ID="$${MINECRAFT_INSTANCE_ID:-dummy}" \
	MINECRAFT_SSM_BUCKET="$${MINECRAFT_SSM_BUCKET:-dummy}" \
	MINECRAFT_RCON_PASSWORD="$${MINECRAFT_RCON_PASSWORD:-dummy}" \
	ANSIBLE_CONFIG="$(ANSIBLE_CONFIG_FILE)" \
	uv run ansible-playbook -i infra/ansible/inventory/production/hosts.yml infra/ansible/site.yml --syntax-check

molecule-test:
	@cd "$(ANSIBLE_ROLES_DIR)/common" && uv run molecule test
	@cd "$(ANSIBLE_ROLES_DIR)/java" && uv run molecule test
	@cd "$(ANSIBLE_ROLES_DIR)/wrapper-scripts" && uv run molecule test
