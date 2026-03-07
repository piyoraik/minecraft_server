AWS_REGION ?= ap-northeast-1
AWS_CLI_BIN ?= aws
COMPUTE_STACK_NAME ?= ComputeStack
LAMBDA_STACK_NAME ?= LambdaStack
RCON_SECRET_ID ?= /minecraft/rcon-password
DISCORD_APPLICATION_ID_SECRET_ID ?= /minecraft/discord-application-id
DISCORD_BOT_TOKEN_SECRET_ID ?= /minecraft/discord-token
ANSIBLE_GALAXY_CMD ?= ansible-galaxy
ANSIBLE_PLAYBOOK_CMD ?= ansible-playbook
SESSION_INSTANCE_ID ?=

.PHONY: register-commands ansible-ssm ansible-ssm-check ansible-ssm-op ansible-ssm-op-check ssm-session

register-commands:
	AWS_REGION="$(AWS_REGION)" \
	AWS_CLI_BIN="$(AWS_CLI_BIN)" \
	DISCORD_APPLICATION_ID_SECRET_ID="$(DISCORD_APPLICATION_ID_SECRET_ID)" \
	DISCORD_BOT_TOKEN_SECRET_ID="$(DISCORD_BOT_TOKEN_SECRET_ID)" \
	/Users/s-tanaka/work/minecraft/scripts/register-discord-commands.sh

ansible-ssm:
	AWS_REGION="$(AWS_REGION)" \
	AWS_CLI_BIN="$(AWS_CLI_BIN)" \
	COMPUTE_STACK_NAME="$(COMPUTE_STACK_NAME)" \
	LAMBDA_STACK_NAME="$(LAMBDA_STACK_NAME)" \
	RCON_SECRET_ID="$(RCON_SECRET_ID)" \
	ANSIBLE_GALAXY_CMD="$(ANSIBLE_GALAXY_CMD)" \
	ANSIBLE_PLAYBOOK_CMD="$(ANSIBLE_PLAYBOOK_CMD)" \
	/Users/s-tanaka/work/minecraft/scripts/run-ansible-ssm.sh

ansible-ssm-check:
	AWS_REGION="$(AWS_REGION)" \
	AWS_CLI_BIN="$(AWS_CLI_BIN)" \
	COMPUTE_STACK_NAME="$(COMPUTE_STACK_NAME)" \
	LAMBDA_STACK_NAME="$(LAMBDA_STACK_NAME)" \
	RCON_SECRET_ID="$(RCON_SECRET_ID)" \
	ANSIBLE_GALAXY_CMD="$(ANSIBLE_GALAXY_CMD)" \
	ANSIBLE_PLAYBOOK_CMD="$(ANSIBLE_PLAYBOOK_CMD)" \
	/Users/s-tanaka/work/minecraft/scripts/run-ansible-ssm.sh --check

ansible-ssm-op:
	AWS_REGION="$(AWS_REGION)" \
	AWS_CLI_BIN="$(AWS_CLI_BIN)" \
	COMPUTE_STACK_NAME="$(COMPUTE_STACK_NAME)" \
	LAMBDA_STACK_NAME="$(LAMBDA_STACK_NAME)" \
	RCON_SECRET_ID="$(RCON_SECRET_ID)" \
	ANSIBLE_GALAXY_CMD="$(ANSIBLE_GALAXY_CMD)" \
	ANSIBLE_PLAYBOOK_CMD="$(ANSIBLE_PLAYBOOK_CMD)" \
	/Users/s-tanaka/work/minecraft/scripts/run-ansible-ssm-op.sh

ansible-ssm-op-check:
	AWS_REGION="$(AWS_REGION)" \
	AWS_CLI_BIN="$(AWS_CLI_BIN)" \
	COMPUTE_STACK_NAME="$(COMPUTE_STACK_NAME)" \
	LAMBDA_STACK_NAME="$(LAMBDA_STACK_NAME)" \
	RCON_SECRET_ID="$(RCON_SECRET_ID)" \
	ANSIBLE_GALAXY_CMD="$(ANSIBLE_GALAXY_CMD)" \
	ANSIBLE_PLAYBOOK_CMD="$(ANSIBLE_PLAYBOOK_CMD)" \
	/Users/s-tanaka/work/minecraft/scripts/run-ansible-ssm-op.sh --check

ssm-session:
	INSTANCE_ID="$${SESSION_INSTANCE_ID:-$$("$(AWS_CLI_BIN)" cloudformation describe-stacks \
		--stack-name "$(COMPUTE_STACK_NAME)" \
		--region "$(AWS_REGION)" \
		--query "Stacks[0].Outputs[?OutputKey=='InstanceId'].OutputValue | [0]" \
		--output text)}"; \
	"$(AWS_CLI_BIN)" ssm start-session --target "$$INSTANCE_ID" --region "$(AWS_REGION)"
