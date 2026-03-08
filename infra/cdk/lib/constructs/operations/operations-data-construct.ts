import type { RemovalPolicy } from "aws-cdk-lib"
import * as dynamodb from "aws-cdk-lib/aws-dynamodb"
import * as s3 from "aws-cdk-lib/aws-s3"
import { Construct } from "constructs"

type OperationsDataConstructProps = {
  removalPolicy: RemovalPolicy
}

/**
 * 運用系とプレイヤー統計処理で共有する保存先を一か所に集約し、参照先の分散を防ぐ。
 */
export class OperationsDataConstruct extends Construct {
  public readonly ansibleSsmBucket: s3.IBucket
  public readonly playerStatsTable: dynamodb.ITable

  public constructor(scope: Construct, id: string, props: OperationsDataConstructProps) {
    super(scope, id)

    this.ansibleSsmBucket = new s3.Bucket(this, "AnsibleSsmBucket", {
      autoDeleteObjects: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: props.removalPolicy,
      versioned: true
    })

    this.playerStatsTable = new dynamodb.Table(this, "PlayerStatsTable", {
      tableName: "minecraft-player-stats",
      partitionKey: {
        name: "playerName",
        type: dynamodb.AttributeType.STRING
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: props.removalPolicy
    })
  }
}
