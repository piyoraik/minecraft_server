import { CfnOutput, Stack, type StackProps } from "aws-cdk-lib"
import * as lambda from "aws-cdk-lib/aws-lambda"
import type { Construct } from "constructs"

import { CoreSecretsConstruct } from "../constructs/core-secrets-construct"
import { DiscordBotConstruct } from "../constructs/discord-bot-construct"
import { LambdaLogGroupsConstruct } from "../constructs/lambda-log-groups-construct"
import { OperationsDataConstruct } from "../constructs/operations-data-construct"
import { PlayerEventPipelineConstruct } from "../constructs/player-event-pipeline-construct"

export type LambdaStackProps = StackProps

/**
 * Discord 連携とプレイヤー統計処理を担当する Lambda 群を定義する。
 * すべての secret は Secrets Manager に逃がし、関数には ARN のみを渡す。
 */
export class LambdaStack extends Stack {
  public constructor(scope: Construct, id: string, props?: LambdaStackProps) {
    super(scope, id, props)

    const logGroups = new LambdaLogGroupsConstruct(this, "LogGroups")
    const secrets = new CoreSecretsConstruct(this, "Secrets")
    const operationsData = new OperationsDataConstruct(this, "OperationsData")
    const discordBot = new DiscordBotConstruct(this, "DiscordBot", {
      commandProcessorLogGroup: logGroups.commandProcessor,
      discordHandlerLogGroup: logGroups.discordHandler,
      discordPublicKey: secrets.discordPublicKey,
      discordApplicationId: secrets.discordApplicationId,
      playerStatsTable: operationsData.playerStatsTable
    })
    const playerEventPipeline = new PlayerEventPipelineConstruct(this, "PlayerEventPipeline", {
      minecraftServerLogGroup: logGroups.minecraftServer,
      playerEventProcessorLogGroup: logGroups.playerEventProcessor,
      playerStatsTable: operationsData.playerStatsTable,
      playerEventWebhookUrl: secrets.playerEventWebhookUrl
    })

    const functionUrl = discordBot.discordHandlerFunction.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE
    })

    new CfnOutput(this, "DiscordHandlerFunctionUrl", {
      value: functionUrl.url
    })

    new CfnOutput(this, "DiscordHandlerFunctionName", {
      value: discordBot.discordHandlerFunction.functionName
    })

    new CfnOutput(this, "CommandProcessorFunctionName", {
      value: discordBot.commandProcessorFunction.functionName
    })

    new CfnOutput(this, "PlayerEventProcessorFunctionName", {
      value: playerEventPipeline.playerEventProcessorFunction.functionName
    })

    new CfnOutput(this, "DiscordTokenSecretArn", {
      value: secrets.discordToken.secretArn
    })

    new CfnOutput(this, "DiscordPublicKeySecretArn", {
      value: secrets.discordPublicKey.secretArn
    })

    new CfnOutput(this, "DiscordApplicationIdSecretArn", {
      value: secrets.discordApplicationId.secretArn
    })

    new CfnOutput(this, "RconPasswordSecretArn", {
      value: secrets.rconPassword.secretArn
    })

    new CfnOutput(this, "PlayerEventWebhookUrlSecretArn", {
      value: secrets.playerEventWebhookUrl.secretArn
    })

    new CfnOutput(this, "PlayerStatsTableName", {
      value: operationsData.playerStatsTable.tableName
    })

    new CfnOutput(this, "AnsibleSsmBucketName", {
      value: operationsData.ansibleSsmBucket.bucketName
    })
  }
}
