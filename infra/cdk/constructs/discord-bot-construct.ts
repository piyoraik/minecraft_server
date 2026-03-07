import { Duration } from "aws-cdk-lib"
import * as dynamodb from "aws-cdk-lib/aws-dynamodb"
import * as iam from "aws-cdk-lib/aws-iam"
import * as lambda from "aws-cdk-lib/aws-lambda"
import * as logs from "aws-cdk-lib/aws-logs"
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager"
import { Construct } from "constructs"

import {
  createLambdaCode,
  createLogPolicyResources,
  getCfnFunction,
  getCfnLogGroup,
  PROJECT_TAG_VALUE
} from "./lambda-utils"

export type DiscordBotConstructProps = {
  commandProcessorLogGroup: logs.LogGroup
  discordHandlerLogGroup: logs.LogGroup
  discordPublicKey: secretsmanager.ISecret
  discordApplicationId: secretsmanager.ISecret
  playerStatsTable: dynamodb.ITable
}

/**
 * Discord 受付 Lambda とコマンド処理 Lambda をまとめて定義する。
 */
export class DiscordBotConstruct extends Construct {
  public readonly commandProcessorFunction: lambda.Function
  public readonly discordHandlerFunction: lambda.Function

  public constructor(scope: Construct, id: string, props: DiscordBotConstructProps) {
    super(scope, id)

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
        resources: createLogPolicyResources(props.commandProcessorLogGroup)
      })
    )
    props.playerStatsTable.grantReadData(commandProcessorRole)

    this.commandProcessorFunction = new lambda.Function(this, "CommandProcessorFunction", {
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
        PLAYER_STATS_TABLE_NAME: props.playerStatsTable.tableName
      }
    })

    const commandProcessorCfnFunction = getCfnFunction(this.commandProcessorFunction)
    commandProcessorCfnFunction.loggingConfig = {
      logFormat: "Text",
      logGroup: props.commandProcessorLogGroup.logGroupName
    }
    commandProcessorCfnFunction.addDependency(getCfnLogGroup(props.commandProcessorLogGroup))

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
        resources: [this.commandProcessorFunction.functionArn]
      })
    )
    discordHandlerRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"],
        resources: createLogPolicyResources(props.discordHandlerLogGroup)
      })
    )

    props.discordPublicKey.grantRead(discordHandlerRole)
    props.discordApplicationId.grantRead(discordHandlerRole)

    this.discordHandlerFunction = new lambda.Function(this, "DiscordHandlerFunction", {
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
        DISCORD_PUBLIC_KEY_SECRET_ARN: props.discordPublicKey.secretArn,
        DISCORD_APP_ID_SECRET_ARN: props.discordApplicationId.secretArn,
        PROCESSOR_FUNCTION_NAME: this.commandProcessorFunction.functionName
      }
    })

    const discordHandlerCfnFunction = getCfnFunction(this.discordHandlerFunction)
    discordHandlerCfnFunction.loggingConfig = {
      logFormat: "Text",
      logGroup: props.discordHandlerLogGroup.logGroupName
    }
    discordHandlerCfnFunction.addDependency(getCfnLogGroup(props.discordHandlerLogGroup))
  }
}
