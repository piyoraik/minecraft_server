import assert from "node:assert/strict"
import test from "node:test"

import { Duration, RemovalPolicy, Stack } from "aws-cdk-lib"
import { Match, Template } from "aws-cdk-lib/assertions"
import * as logs from "aws-cdk-lib/aws-logs"

import { DiscordBotConstruct } from "../../lib/constructs/application/discord-bot-construct"
import { PlayerEventPipelineConstruct } from "../../lib/constructs/application/player-event-pipeline-construct"
import { MinecraftServerConstruct } from "../../lib/constructs/compute/minecraft-server-construct"
import { LambdaLogGroupsConstruct } from "../../lib/constructs/monitoring/lambda-log-groups-construct"
import { MinecraftNetworkConstruct } from "../../lib/constructs/network/minecraft-network-construct"
import { OperationsDataConstruct } from "../../lib/constructs/operations/operations-data-construct"
import { CoreSecretsConstruct } from "../../lib/constructs/security/core-secrets-construct"

const asUnknownRecord = (value: unknown): Record<string, unknown> | null => {
  if (typeof value !== "object" || value === null) {
    return null
  }

  return value as Record<string, unknown>
}

const readFunctionName = (resource: unknown): string | undefined => {
  const resourceRecord = asUnknownRecord(resource)
  if (resourceRecord === null) {
    return undefined
  }

  const properties = asUnknownRecord(resourceRecord.Properties)
  if (properties === null || typeof properties.FunctionName !== "string") {
    return undefined
  }

  return properties.FunctionName
}

void test("MinecraftNetworkConstruct は VPC と SecurityGroup と Elastic IP を作成する", () => {
  const stack = new Stack()

  new MinecraftNetworkConstruct(stack, "Network", {
    standardTags: {
      Project: "minecraft-server",
      Environment: "dev",
      ManagedBy: "cdk",
      Owner: "minecraft-team"
    },
    minecraftPort: 25565
  })

  const template = Template.fromStack(stack)

  template.resourceCountIs("AWS::EC2::VPC", 1)
  template.resourceCountIs("AWS::EC2::SecurityGroup", 1)
  template.resourceCountIs("AWS::EC2::EIP", 1)
  template.hasResourceProperties("AWS::EC2::SecurityGroup", {
    SecurityGroupIngress: Match.arrayWith([
      Match.objectLike({
        FromPort: 25565,
        ToPort: 25565,
        IpProtocol: "tcp"
      })
    ])
  })
})

void test("MinecraftServerConstruct は EC2 と EIP 紐付けと SSM 用 IAM を作成する", () => {
  const stack = new Stack()
  const network = new MinecraftNetworkConstruct(stack, "Network", {
    standardTags: {
      Project: "minecraft-server",
      Environment: "dev",
      ManagedBy: "cdk",
      Owner: "minecraft-team"
    },
    minecraftPort: 25565
  })

  new MinecraftServerConstruct(stack, "Server", {
    elasticIp: network.elasticIp,
    gracefulShutdownTimeout: Duration.seconds(60),
    instanceType: "t3.medium",
    securityGroup: network.securityGroup,
    vpc: network.vpc
  })

  const template = Template.fromStack(stack)

  template.hasResourceProperties("AWS::EC2::Instance", {
    DisableApiTermination: false,
    BlockDeviceMappings: Match.arrayWith([
      Match.objectLike({
        Ebs: Match.objectLike({
          DeleteOnTermination: false,
          Encrypted: true,
          VolumeType: "gp3"
        })
      })
    ])
  })
  template.hasResourceProperties("AWS::IAM::Role", {
    ManagedPolicyArns: Match.arrayWith([
      Match.objectLike({
        "Fn::Join": Match.anyValue()
      })
    ])
  })
  template.resourceCountIs("AWS::EC2::EIPAssociation", 1)
})

void test("OperationsDataConstruct は暗号化付き S3 と DynamoDB を作成する", () => {
  const stack = new Stack()

  new OperationsDataConstruct(stack, "OperationsData", {
    removalPolicy: RemovalPolicy.DESTROY
  })

  const template = Template.fromStack(stack)

  template.hasResourceProperties("AWS::S3::Bucket", {
    BucketEncryption: {
      ServerSideEncryptionConfiguration: Match.arrayWith([
        Match.objectLike({
          ServerSideEncryptionByDefault: {
            SSEAlgorithm: "AES256"
          }
        })
      ])
    },
    VersioningConfiguration: {
      Status: "Enabled"
    }
  })
  template.hasResource("AWS::DynamoDB::Table", {
    UpdateReplacePolicy: "Delete",
    DeletionPolicy: "Delete"
  })
})

void test("CoreSecretsConstruct は運用用 secret を固定名で作成する", () => {
  const stack = new Stack()

  new CoreSecretsConstruct(stack, "Secrets", {
    removalPolicy: RemovalPolicy.DESTROY
  })

  const template = Template.fromStack(stack)

  template.resourceCountIs("AWS::SecretsManager::Secret", 5)
  template.hasResourceProperties("AWS::SecretsManager::Secret", {
    Name: "/minecraft/discord-token"
  })
  template.hasResourceProperties("AWS::SecretsManager::Secret", {
    Name: "/minecraft/rcon-password"
  })
})

void test("LambdaLogGroupsConstruct は保持期間付き LogGroup をまとめて作成する", () => {
  const stack = new Stack()

  new LambdaLogGroupsConstruct(stack, "LogGroups", {
    removalPolicy: RemovalPolicy.DESTROY,
    retention: logs.RetentionDays.TWO_WEEKS
  })

  const template = Template.fromStack(stack)

  template.resourceCountIs("AWS::Logs::LogGroup", 4)
  template.hasResourceProperties("AWS::Logs::LogGroup", {
    LogGroupName: "/minecraft/lambda/discord-handler",
    RetentionInDays: 14
  })
})

void test("DiscordBotConstruct は 2 つの Lambda と必要な権限を構成する", () => {
  const stack = new Stack()
  const logGroups = new LambdaLogGroupsConstruct(stack, "LogGroups", {
    removalPolicy: RemovalPolicy.DESTROY,
    retention: logs.RetentionDays.TWO_WEEKS
  })
  const secrets = new CoreSecretsConstruct(stack, "Secrets", {
    removalPolicy: RemovalPolicy.DESTROY
  })
  const operationsData = new OperationsDataConstruct(stack, "OperationsData", {
    removalPolicy: RemovalPolicy.DESTROY
  })

  new DiscordBotConstruct(stack, "DiscordBot", {
    commandProcessorLogGroup: logGroups.commandProcessor,
    discordApplicationId: secrets.discordApplicationId,
    discordHandlerLogGroup: logGroups.discordHandler,
    discordPublicKey: secrets.discordPublicKey,
    playerStatsTable: operationsData.playerStatsTable,
    projectTagValue: "minecraft-server"
  })

  const template = Template.fromStack(stack)
  const functions = template.findResources("AWS::Lambda::Function")
  const functionNames = Object.values(functions).map((resource) => readFunctionName(resource))

  assert(functionNames.includes("minecraft-command-processor"))
  assert(functionNames.includes("minecraft-discord-handler"))
  template.hasResourceProperties("AWS::IAM::Policy", {
    PolicyDocument: {
      Statement: Match.arrayWith([
        Match.objectLike({
          Action: "lambda:InvokeFunction"
        })
      ])
    }
  })
})

void test("PlayerEventPipelineConstruct は Log subscription と通知用 Lambda を構成する", () => {
  const stack = new Stack()
  const logGroups = new LambdaLogGroupsConstruct(stack, "LogGroups", {
    removalPolicy: RemovalPolicy.DESTROY,
    retention: logs.RetentionDays.TWO_WEEKS
  })
  const secrets = new CoreSecretsConstruct(stack, "Secrets", {
    removalPolicy: RemovalPolicy.DESTROY
  })
  const operationsData = new OperationsDataConstruct(stack, "OperationsData", {
    removalPolicy: RemovalPolicy.DESTROY
  })

  new PlayerEventPipelineConstruct(stack, "PlayerEventPipeline", {
    minecraftServerLogGroup: logGroups.minecraftServer,
    playerEventProcessorLogGroup: logGroups.playerEventProcessor,
    playerEventWebhookUrl: secrets.playerEventWebhookUrl,
    playerStatsTable: operationsData.playerStatsTable
  })

  const template = Template.fromStack(stack)

  template.hasResourceProperties("AWS::Logs::SubscriptionFilter", {
    FilterPattern: "?\"joined the game\" ?\"left the game\""
  })
  template.hasResourceProperties("AWS::Lambda::Function", {
    FunctionName: "minecraft-player-event-processor",
    Environment: {
      Variables: Match.objectLike({
        PLAYER_STATS_TABLE_NAME: Match.anyValue(),
        PLAYER_EVENT_WEBHOOK_SECRET_ARN: Match.anyValue()
      })
    }
  })
})
