import type { RemovalPolicy } from "aws-cdk-lib"
import * as logs from "aws-cdk-lib/aws-logs"
import { Construct } from "constructs"

type LambdaLogGroupsConstructProps = {
  removalPolicy: RemovalPolicy
  retention: logs.RetentionDays
}

/**
 * 運用で使う LogGroup をここへ集約し、保持期間や命名規則のずれを防ぐ。
 */
export class LambdaLogGroupsConstruct extends Construct {
  public readonly discordHandler: logs.ILogGroup
  public readonly commandProcessor: logs.ILogGroup
  public readonly minecraftServer: logs.ILogGroup
  public readonly playerEventProcessor: logs.ILogGroup

  public constructor(scope: Construct, id: string, props: LambdaLogGroupsConstructProps) {
    super(scope, id)

    this.discordHandler = new logs.LogGroup(this, "DiscordHandler", {
      logGroupName: "/minecraft/lambda/discord-handler",
      retention: props.retention,
      removalPolicy: props.removalPolicy
    })

    this.commandProcessor = new logs.LogGroup(this, "CommandProcessor", {
      logGroupName: "/minecraft/lambda/command-processor",
      retention: props.retention,
      removalPolicy: props.removalPolicy
    })

    this.minecraftServer = new logs.LogGroup(this, "MinecraftServer", {
      logGroupName: "/minecraft/ec2/minecraft-server",
      retention: props.retention,
      removalPolicy: props.removalPolicy
    })

    this.playerEventProcessor = new logs.LogGroup(this, "PlayerEventProcessor", {
      logGroupName: "/minecraft/lambda/player-event-processor",
      retention: props.retention,
      removalPolicy: props.removalPolicy
    })
  }
}
