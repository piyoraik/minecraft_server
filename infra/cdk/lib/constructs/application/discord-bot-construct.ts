import { Duration } from "aws-cdk-lib"
import * as dynamodb from "aws-cdk-lib/aws-dynamodb"
import * as iam from "aws-cdk-lib/aws-iam"
import * as lambda from "aws-cdk-lib/aws-lambda"
import * as lambdaNodejs from "aws-cdk-lib/aws-lambda-nodejs"
import * as logs from "aws-cdk-lib/aws-logs"
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager"
import { Construct } from "constructs"

import {
  createNodejsServiceFunctionProps,
  createLogPolicyResources,
  getCfnFunction,
  getCfnLogGroup
} from "../../helpers/lambda"

export type DiscordBotConstructProps = {
  commandProcessorLogGroup: logs.ILogGroup
  discordApplicationId: secretsmanager.ISecret
  discordHandlerLogGroup: logs.ILogGroup
  discordPublicKey: secretsmanager.ISecret
  playerStatsTable: dynamodb.ITable
  projectTagValue: string
}

/**
 * Discord 受付とコマンド実行を同じ構成単位に閉じ込め、権限付与と連携設定を分散させない。
 */
export class DiscordBotConstruct extends Construct {
  public readonly commandProcessorFunction: lambda.Function
  public readonly discordHandlerFunction: lambda.Function

  public constructor(scope: Construct, id: string, props: DiscordBotConstructProps) {
    super(scope, id)

    // -----------------------------
    // Command Processor
    // -----------------------------
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
            "ec2:ResourceTag/Project": props.projectTagValue
          }
        }
      })
    )
    commandProcessorRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        // EC2 describe と SSM command は対象 ARN で十分に絞れないため、read/control 系に限定している。
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

    this.commandProcessorFunction = new lambdaNodejs.NodejsFunction(
      this,
      "CommandProcessorFunction",
      createNodejsServiceFunctionProps({
        serviceName: "command-processor",
        functionName: "minecraft-command-processor",
        runtime: lambda.Runtime.NODEJS_20_X,
      role: commandProcessorRole,
      timeout: Duration.seconds(300),
      memorySize: 256,
        environment: {
          EC2_PROJECT_TAG_VALUE: props.projectTagValue,
          PLAYER_STATS_TABLE_NAME: props.playerStatsTable.tableName
        }
      })
    )

    const commandProcessorCfnFunction = getCfnFunction(this.commandProcessorFunction)
    commandProcessorCfnFunction.loggingConfig = {
      logFormat: "Text",
      logGroup: props.commandProcessorLogGroup.logGroupName
    }
    commandProcessorCfnFunction.addDependency(getCfnLogGroup(props.commandProcessorLogGroup))

    // -----------------------------
    // Discord Handler
    // -----------------------------
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

    this.discordHandlerFunction = new lambdaNodejs.NodejsFunction(
      this,
      "DiscordHandlerFunction",
      createNodejsServiceFunctionProps({
        serviceName: "discord-handler",
        functionName: "minecraft-discord-handler",
        runtime: lambda.Runtime.NODEJS_20_X,
      role: discordHandlerRole,
      timeout: Duration.seconds(10),
      memorySize: 256,
        environment: {
          DISCORD_PUBLIC_KEY_SECRET_ARN: props.discordPublicKey.secretArn,
          DISCORD_APP_ID_SECRET_ARN: props.discordApplicationId.secretArn,
          PROCESSOR_FUNCTION_NAME: this.commandProcessorFunction.functionName
        }
      })
    )

    const discordHandlerCfnFunction = getCfnFunction(this.discordHandlerFunction)
    discordHandlerCfnFunction.loggingConfig = {
      logFormat: "Text",
      logGroup: props.discordHandlerLogGroup.logGroupName
    }
    discordHandlerCfnFunction.addDependency(getCfnLogGroup(props.discordHandlerLogGroup))
  }
}
