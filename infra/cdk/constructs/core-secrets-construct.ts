import { RemovalPolicy } from "aws-cdk-lib"
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager"
import { Construct } from "constructs"

/**
 * Lambda と運用系で参照する Secrets Manager の secret を定義する。
 */
export class CoreSecretsConstruct extends Construct {
  public readonly discordToken: secretsmanager.Secret
  public readonly discordPublicKey: secretsmanager.Secret
  public readonly discordApplicationId: secretsmanager.Secret
  public readonly rconPassword: secretsmanager.Secret
  public readonly playerEventWebhookUrl: secretsmanager.Secret

  public constructor(scope: Construct, id: string) {
    super(scope, id)

    this.discordToken = new secretsmanager.Secret(this, "DiscordToken", {
      secretName: "/minecraft/discord-token"
    })
    this.discordToken.applyRemovalPolicy(RemovalPolicy.DESTROY)

    this.discordPublicKey = new secretsmanager.Secret(this, "DiscordPublicKey", {
      secretName: "/minecraft/discord-public-key"
    })
    this.discordPublicKey.applyRemovalPolicy(RemovalPolicy.DESTROY)

    this.discordApplicationId = new secretsmanager.Secret(this, "DiscordApplicationId", {
      secretName: "/minecraft/discord-application-id"
    })
    this.discordApplicationId.applyRemovalPolicy(RemovalPolicy.DESTROY)

    this.rconPassword = new secretsmanager.Secret(this, "RconPassword", {
      secretName: "/minecraft/rcon-password"
    })
    this.rconPassword.applyRemovalPolicy(RemovalPolicy.DESTROY)

    this.playerEventWebhookUrl = new secretsmanager.Secret(this, "PlayerEventWebhookUrl", {
      secretName: "/minecraft/player-event-webhook-url"
    })
    this.playerEventWebhookUrl.applyRemovalPolicy(RemovalPolicy.DESTROY)
  }
}
