import { existsSync } from "node:fs"
import path from "node:path"

import { CfnOutput, Duration, Stack, type StackProps } from "aws-cdk-lib"
import * as dynamodb from "aws-cdk-lib/aws-dynamodb"
import * as iam from "aws-cdk-lib/aws-iam"
import * as lambda from "aws-cdk-lib/aws-lambda"
import * as logs from "aws-cdk-lib/aws-logs"
import * as logsDestinations from "aws-cdk-lib/aws-logs-destinations"
import * as s3 from "aws-cdk-lib/aws-s3"
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager"
import type { Construct } from "constructs"

const PROJECT_TAG_VALUE = "minecraft-server"
const LOG_RETENTION = logs.RetentionDays.TWO_WEEKS

const createLogPolicyResources = (logGroup: logs.ILogGroup): string[] => {
  return [logGroup.logGroupArn, `${logGroup.logGroupArn}:*`]
}

const getCfnFunction = (lambdaFunction: lambda.Function): lambda.CfnFunction => {
  const defaultChild = lambdaFunction.node.defaultChild
  if (!(defaultChild instanceof lambda.CfnFunction)) {
    throw new Error("Lambda default child is not CfnFunction")
  }

  return defaultChild
}

const getCfnLogGroup = (logGroup: logs.LogGroup): logs.CfnLogGroup => {
  const defaultChild = logGroup.node.defaultChild
  if (!(defaultChild instanceof logs.CfnLogGroup)) {
    throw new Error("LogGroup default child is not CfnLogGroup")
  }

  return defaultChild
}

const resolveServiceDistPath = (serviceName: string): string => {
  return path.resolve(process.cwd(), "../..", "services", serviceName, "dist")
}

const createLambdaCode = (serviceName: string, fallbackCode: string): lambda.Code => {
  const distPath = resolveServiceDistPath(serviceName)
  if (existsSync(distPath)) {
    return lambda.Code.fromAsset(distPath)
  }

  // dist が未生成でも synth を可能にし、開発初期のフィードバックを速くする。
  return lambda.Code.fromInline(fallbackCode)
}

export type LambdaStackProps = StackProps

/**
 * Discord 連携とプレイヤー統計処理を担当する Lambda 群を定義する。
 * すべての secret は Secrets Manager に逃がし、関数には ARN のみを渡す。
 */
export class LambdaStack extends Stack {
  public constructor(scope: Construct, id: string, props?: LambdaStackProps) {
    super(scope, id, props)

    const discordHandlerLogGroupName = "/minecraft/lambda/discord-handler"
    const commandProcessorLogGroupName = "/minecraft/lambda/command-processor"
    const playerEventProcessorLogGroupName = "/minecraft/lambda/player-event-processor"

    const discordHandlerLogGroup = new logs.LogGroup(this, "DiscordHandlerLogGroup", {
      logGroupName: discordHandlerLogGroupName,
      retention: LOG_RETENTION
    })

    const commandProcessorLogGroup = new logs.LogGroup(this, "CommandProcessorLogGroup", {
      logGroupName: commandProcessorLogGroupName,
      retention: LOG_RETENTION
    })

    const minecraftServerLogGroup = new logs.LogGroup(this, "MinecraftServerLogGroup", {
      logGroupName: "/minecraft/ec2/minecraft-server",
      retention: LOG_RETENTION
    })

    const playerEventProcessorLogGroup = new logs.LogGroup(this, "PlayerEventProcessorLogGroup", {
      logGroupName: playerEventProcessorLogGroupName,
      retention: LOG_RETENTION
    })

    const ansibleSsmBucket = new s3.Bucket(this, "AnsibleSsmBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: true
    })

    const discordToken = new secretsmanager.Secret(this, "DiscordTokenSecret", {
      secretName: "/minecraft/discord-token"
    })
    const discordPublicKey = new secretsmanager.Secret(this, "DiscordPublicKeySecret", {
      secretName: "/minecraft/discord-public-key"
    })
    const discordApplicationId = new secretsmanager.Secret(this, "DiscordApplicationIdSecret", {
      secretName: "/minecraft/discord-application-id"
    })
    const rconPassword = new secretsmanager.Secret(this, "RconPasswordSecret", {
      secretName: "/minecraft/rcon-password"
    })
    const playerEventWebhookUrl = new secretsmanager.Secret(this, "PlayerEventWebhookUrlSecret", {
      secretName: "/minecraft/player-event-webhook-url"
    })
    const playerStatsTable = new dynamodb.Table(this, "PlayerStatsTable", {
      tableName: "minecraft-player-stats",
      partitionKey: {
        name: "playerName",
        type: dynamodb.AttributeType.STRING
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST
    })

    const commandProcessorRole = new iam.Role(this, "CommandProcessorRole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com")
    })
    commandProcessorRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole")
    )

    commandProcessorRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["ec2:StartInstances", "ec2:StopInstances"],
        resources: ["*"],
        conditions: {
          StringEquals: {
            "ec2:ResourceTag/Project": PROJECT_TAG_VALUE
          }
        }
      })
    )

    commandProcessorRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["ec2:DescribeInstances", "ssm:SendCommand", "ssm:GetCommandInvocation"],
        resources: ["*"]
      })
    )

    commandProcessorRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"],
        resources: createLogPolicyResources(commandProcessorLogGroup)
      })
    )

    const commandProcessorFunction = new lambda.Function(this, "CommandProcessorFunction", {
      functionName: "minecraft-command-processor",
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "command-processor/src/index.handler",
      code: createLambdaCode(
        "command-processor",
        "exports.handler=async ()=>{console.log('command-processor fallback');};"
      ),
      role: commandProcessorRole,
      timeout: Duration.seconds(300),
      memorySize: 256,
      environment: {
        EC2_PROJECT_TAG_VALUE: PROJECT_TAG_VALUE,
        PLAYER_STATS_TABLE_NAME: playerStatsTable.tableName
      }
    })
    const commandProcessorCfnFunction = getCfnFunction(commandProcessorFunction)
    commandProcessorCfnFunction.loggingConfig = {
      logFormat: "Text",
      logGroup: commandProcessorLogGroup.logGroupName
    }
    commandProcessorCfnFunction.addDependency(getCfnLogGroup(commandProcessorLogGroup))

    const discordHandlerRole = new iam.Role(this, "DiscordHandlerRole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com")
    })
    discordHandlerRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole")
    )

    discordHandlerRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["lambda:InvokeFunction"],
        resources: [commandProcessorFunction.functionArn]
      })
    )

    discordHandlerRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"],
        resources: createLogPolicyResources(discordHandlerLogGroup)
      })
    )

    discordPublicKey.grantRead(discordHandlerRole)
    discordApplicationId.grantRead(discordHandlerRole)
    playerStatsTable.grantReadData(commandProcessorRole)

    const playerEventProcessorRole = new iam.Role(this, "PlayerEventProcessorRole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com")
    })
    playerEventProcessorRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole")
    )
    playerEventProcessorRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"],
        resources: createLogPolicyResources(playerEventProcessorLogGroup)
      })
    )
    playerStatsTable.grantReadWriteData(playerEventProcessorRole)
    playerEventWebhookUrl.grantRead(playerEventProcessorRole)

    const discordHandlerFunction = new lambda.Function(this, "DiscordHandlerFunction", {
      functionName: "minecraft-discord-handler",
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "discord-handler/src/index.handler",
      code: createLambdaCode(
        "discord-handler",
        "exports.handler=async ()=>({statusCode:200,headers:{'content-type':'application/json'},body:JSON.stringify({type:1})});"
      ),
      role: discordHandlerRole,
      timeout: Duration.seconds(10),
      memorySize: 256,
      environment: {
        DISCORD_PUBLIC_KEY_SECRET_ARN: discordPublicKey.secretArn,
        DISCORD_APP_ID_SECRET_ARN: discordApplicationId.secretArn,
        PROCESSOR_FUNCTION_NAME: commandProcessorFunction.functionName
      }
    })
    const discordHandlerCfnFunction = getCfnFunction(discordHandlerFunction)
    discordHandlerCfnFunction.loggingConfig = {
      logFormat: "Text",
      logGroup: discordHandlerLogGroup.logGroupName
    }
    discordHandlerCfnFunction.addDependency(getCfnLogGroup(discordHandlerLogGroup))

    const playerEventProcessorFunction = new lambda.Function(this, "PlayerEventProcessorFunction", {
      functionName: "minecraft-player-event-processor",
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "src/index.handler",
      code: createLambdaCode(
        "player-event-processor",
        "exports.handler=async ()=>{console.log('player-event-processor fallback');};"
      ),
      role: playerEventProcessorRole,
      timeout: Duration.seconds(30),
      memorySize: 256,
      environment: {
        PLAYER_STATS_TABLE_NAME: playerStatsTable.tableName,
        PLAYER_EVENT_WEBHOOK_SECRET_ARN: playerEventWebhookUrl.secretArn
      }
    })
    const playerEventProcessorCfnFunction = getCfnFunction(playerEventProcessorFunction)
    playerEventProcessorCfnFunction.loggingConfig = {
      logFormat: "Text",
      logGroup: playerEventProcessorLogGroup.logGroupName
    }
    playerEventProcessorCfnFunction.addDependency(getCfnLogGroup(playerEventProcessorLogGroup))

    new logs.SubscriptionFilter(this, "MinecraftPlayerEventSubscription", {
      logGroup: minecraftServerLogGroup,
      destination: new logsDestinations.LambdaDestination(playerEventProcessorFunction),
      filterPattern: logs.FilterPattern.anyTerm("joined the game", "left the game")
    })

    const functionUrl = discordHandlerFunction.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE
    })

    new CfnOutput(this, "DiscordHandlerFunctionUrl", {
      value: functionUrl.url
    })

    new CfnOutput(this, "DiscordHandlerFunctionName", {
      value: discordHandlerFunction.functionName
    })

    new CfnOutput(this, "CommandProcessorFunctionName", {
      value: commandProcessorFunction.functionName
    })

    new CfnOutput(this, "PlayerEventProcessorFunctionName", {
      value: playerEventProcessorFunction.functionName
    })

    new CfnOutput(this, "DiscordTokenSecretArn", {
      value: discordToken.secretArn
    })

    new CfnOutput(this, "DiscordPublicKeySecretArn", {
      value: discordPublicKey.secretArn
    })

    new CfnOutput(this, "DiscordApplicationIdSecretArn", {
      value: discordApplicationId.secretArn
    })

    new CfnOutput(this, "RconPasswordSecretArn", {
      value: rconPassword.secretArn
    })

    new CfnOutput(this, "PlayerEventWebhookUrlSecretArn", {
      value: playerEventWebhookUrl.secretArn
    })

    new CfnOutput(this, "PlayerStatsTableName", {
      value: playerStatsTable.tableName
    })

    new CfnOutput(this, "AnsibleSsmBucketName", {
      value: ansibleSsmBucket.bucketName
    })
  }
}
