import { Duration } from "aws-cdk-lib"
import * as dynamodb from "aws-cdk-lib/aws-dynamodb"
import * as iam from "aws-cdk-lib/aws-iam"
import * as lambda from "aws-cdk-lib/aws-lambda"
import * as lambdaNodejs from "aws-cdk-lib/aws-lambda-nodejs"
import * as logs from "aws-cdk-lib/aws-logs"
import * as logsDestinations from "aws-cdk-lib/aws-logs-destinations"
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager"
import { Construct } from "constructs"

import {
  createNodejsServiceFunctionProps,
  createLogPolicyResources,
  getCfnFunction,
  getCfnLogGroup
} from "../../helpers/lambda"

export type PlayerEventPipelineConstructProps = {
  minecraftServerLogGroup: logs.ILogGroup
  playerEventProcessorLogGroup: logs.ILogGroup
  playerEventWebhookUrl: secretsmanager.ISecret
  playerStatsTable: dynamodb.ITable
}

/**
 * ログ購読から統計更新までを一つの流れとして束ね、入退室処理の依存関係を散らさない。
 */
export class PlayerEventPipelineConstruct extends Construct {
  public readonly playerEventProcessorFunction: lambda.Function

  public constructor(scope: Construct, id: string, props: PlayerEventPipelineConstructProps) {
    super(scope, id)

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
        resources: createLogPolicyResources(props.playerEventProcessorLogGroup)
      })
    )

    props.playerStatsTable.grantReadWriteData(playerEventProcessorRole)
    props.playerEventWebhookUrl.grantRead(playerEventProcessorRole)

    this.playerEventProcessorFunction = new lambdaNodejs.NodejsFunction(
      this,
      "PlayerEventProcessorFunction",
      createNodejsServiceFunctionProps({
        serviceName: "player-event-processor",
        functionName: "minecraft-player-event-processor",
        runtime: lambda.Runtime.NODEJS_20_X,
        role: playerEventProcessorRole,
        timeout: Duration.seconds(30),
        memorySize: 256,
        environment: {
          PLAYER_STATS_TABLE_NAME: props.playerStatsTable.tableName,
          PLAYER_EVENT_WEBHOOK_SECRET_ARN: props.playerEventWebhookUrl.secretArn
        }
      })
    )

    const playerEventProcessorCfnFunction = getCfnFunction(this.playerEventProcessorFunction)
    playerEventProcessorCfnFunction.loggingConfig = {
      logFormat: "Text",
      logGroup: props.playerEventProcessorLogGroup.logGroupName
    }
    playerEventProcessorCfnFunction.addDependency(getCfnLogGroup(props.playerEventProcessorLogGroup))

    new logs.SubscriptionFilter(this, "MinecraftPlayerEventSubscription", {
      logGroup: props.minecraftServerLogGroup,
      destination: new logsDestinations.LambdaDestination(this.playerEventProcessorFunction),
      filterPattern: logs.FilterPattern.anyTerm("joined the game", "left the game")
    })
  }
}
