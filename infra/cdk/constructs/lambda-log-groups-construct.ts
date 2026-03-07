import { RemovalPolicy } from "aws-cdk-lib"
import * as logs from "aws-cdk-lib/aws-logs"
import { Construct } from "constructs"

import { LOG_RETENTION } from "./lambda-utils"

/**
 * Minecraft 運用で利用する CloudWatch LogGroup をまとめて定義する。
 */
export class LambdaLogGroupsConstruct extends Construct {
  public readonly discordHandler: logs.LogGroup
  public readonly commandProcessor: logs.LogGroup
  public readonly minecraftServer: logs.LogGroup
  public readonly playerEventProcessor: logs.LogGroup

  public constructor(scope: Construct, id: string) {
    super(scope, id)

    this.discordHandler = new logs.LogGroup(this, "DiscordHandler", {
      logGroupName: "/minecraft/lambda/discord-handler",
      retention: LOG_RETENTION,
      removalPolicy: RemovalPolicy.DESTROY
    })

    this.commandProcessor = new logs.LogGroup(this, "CommandProcessor", {
      logGroupName: "/minecraft/lambda/command-processor",
      retention: LOG_RETENTION,
      removalPolicy: RemovalPolicy.DESTROY
    })

    this.minecraftServer = new logs.LogGroup(this, "MinecraftServer", {
      logGroupName: "/minecraft/ec2/minecraft-server",
      retention: LOG_RETENTION,
      removalPolicy: RemovalPolicy.DESTROY
    })

    this.playerEventProcessor = new logs.LogGroup(this, "PlayerEventProcessor", {
      logGroupName: "/minecraft/lambda/player-event-processor",
      retention: LOG_RETENTION,
      removalPolicy: RemovalPolicy.DESTROY
    })
  }
}
