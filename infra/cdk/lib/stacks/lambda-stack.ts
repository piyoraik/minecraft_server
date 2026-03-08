import { CfnOutput, Stack, type StackProps } from "aws-cdk-lib"
import * as lambda from "aws-cdk-lib/aws-lambda"
import * as logs from "aws-cdk-lib/aws-logs"
import type { Construct } from "constructs"

import type { AppConfig } from "../config/types"
import { DiscordBotConstruct } from "../constructs/application/discord-bot-construct"
import { PlayerEventPipelineConstruct } from "../constructs/application/player-event-pipeline-construct"
import { LambdaLogGroupsConstruct } from "../constructs/monitoring/lambda-log-groups-construct"
import { OperationsDataConstruct } from "../constructs/operations/operations-data-construct"
import { CoreSecretsConstruct } from "../constructs/security/core-secrets-construct"
import { applyStandardTags } from "../helpers/tags"

export type LambdaStackProps = StackProps & {
  config: AppConfig
}

/**
 * Discord 連携とプレイヤー統計処理を担当する Lambda 群をまとめる Stack。
 *
 * @remarks
 * secret、log group、データストア、Lambda の接続点をここに集約し、各 Construct の責務を分離する。
 */
export class LambdaStack extends Stack {
  public constructor(scope: Construct, id: string, props: LambdaStackProps) {
    super(scope, id, props)
    applyStandardTags(this, props.config)

    const logGroups = new LambdaLogGroupsConstruct(this, "LogGroups", {
      removalPolicy: props.config.removalPolicies.logs,
      retention: logs.RetentionDays.TWO_WEEKS
    })
    const secrets = new CoreSecretsConstruct(this, "Secrets", {
      removalPolicy: props.config.removalPolicies.secrets
    })
    const operationsData = new OperationsDataConstruct(this, "OperationsData", {
      removalPolicy: props.config.removalPolicies.stateful
    })
    const discordBot = new DiscordBotConstruct(this, "DiscordBot", {
      commandProcessorLogGroup: logGroups.commandProcessor,
      discordApplicationId: secrets.discordApplicationId,
      discordHandlerLogGroup: logGroups.discordHandler,
      discordPublicKey: secrets.discordPublicKey,
      playerStatsTable: operationsData.playerStatsTable,
      projectTagValue: props.config.tags.Project
    })
    const playerEventPipeline = new PlayerEventPipelineConstruct(this, "PlayerEventPipeline", {
      minecraftServerLogGroup: logGroups.minecraftServer,
      playerEventProcessorLogGroup: logGroups.playerEventProcessor,
      playerEventWebhookUrl: secrets.playerEventWebhookUrl,
      playerStatsTable: operationsData.playerStatsTable
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
