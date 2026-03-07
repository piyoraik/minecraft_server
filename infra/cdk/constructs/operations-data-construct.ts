import { RemovalPolicy } from "aws-cdk-lib"
import * as dynamodb from "aws-cdk-lib/aws-dynamodb"
import * as s3 from "aws-cdk-lib/aws-s3"
import { Construct } from "constructs"

/**
 * Ansible とプレイヤー統計処理で共有するデータストアを定義する。
 */
export class OperationsDataConstruct extends Construct {
  public readonly ansibleSsmBucket: s3.Bucket
  public readonly playerStatsTable: dynamodb.Table

  public constructor(scope: Construct, id: string) {
    super(scope, id)

    this.ansibleSsmBucket = new s3.Bucket(this, "AnsibleSsmBucket", {
      autoDeleteObjects: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY,
      versioned: true
    })

    this.playerStatsTable = new dynamodb.Table(this, "PlayerStatsTable", {
      tableName: "minecraft-player-stats",
      partitionKey: {
        name: "playerName",
        type: dynamodb.AttributeType.STRING
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY
    })
  }
}
