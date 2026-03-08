import type { RemovalPolicy } from "aws-cdk-lib"
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager"
import { Construct } from "constructs"

type CoreSecretsConstructProps = {
  removalPolicy: RemovalPolicy
}

/**
 * 運用で使う secret 名をここに固定し、各スタックで個別命名がぶれないようにする。
 *
 * @remarks
 * secret の参照先をこの Construct に集約し、各 Stack から命名規則を隠蔽する。
 */
export class CoreSecretsConstruct extends Construct {
  public readonly discordToken: secretsmanager.ISecret
  public readonly discordPublicKey: secretsmanager.ISecret
  public readonly discordApplicationId: secretsmanager.ISecret
  public readonly rconPassword: secretsmanager.ISecret
  public readonly playerEventWebhookUrl: secretsmanager.ISecret

  public constructor(scope: Construct, id: string, props: CoreSecretsConstructProps) {
    super(scope, id)

    this.discordToken = new secretsmanager.Secret(this, "DiscordToken", {
      secretName: "/minecraft/discord-token"
    })
    this.discordToken.applyRemovalPolicy(props.removalPolicy)

    this.discordPublicKey = new secretsmanager.Secret(this, "DiscordPublicKey", {
      secretName: "/minecraft/discord-public-key"
    })
    this.discordPublicKey.applyRemovalPolicy(props.removalPolicy)

    this.discordApplicationId = new secretsmanager.Secret(this, "DiscordApplicationId", {
      secretName: "/minecraft/discord-application-id"
    })
    this.discordApplicationId.applyRemovalPolicy(props.removalPolicy)

    this.rconPassword = new secretsmanager.Secret(this, "RconPassword", {
      secretName: "/minecraft/rcon-password"
    })
    this.rconPassword.applyRemovalPolicy(props.removalPolicy)

    this.playerEventWebhookUrl = new secretsmanager.Secret(this, "PlayerEventWebhookUrl", {
      secretName: "/minecraft/player-event-webhook-url"
    })
    this.playerEventWebhookUrl.applyRemovalPolicy(props.removalPolicy)
  }
}
