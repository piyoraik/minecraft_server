import { Tags } from "aws-cdk-lib"
import * as ec2 from "aws-cdk-lib/aws-ec2"
import { Construct } from "constructs"

type MinecraftNetworkConstructProps = {
  standardTags: Record<string, string>
  minecraftPort: number
}

/**
 * Minecraft サーバー用の VPC、SecurityGroup、Elastic IP をまとめる Construct。
 *
 * 単一 AZ の public subnet 構成をこの部品に閉じ込め、PoC の運用前提を
 * Stack 側へ漏らさないようにする。
 */
export class MinecraftNetworkConstruct extends Construct {
  public readonly vpc: ec2.IVpc
  public readonly securityGroup: ec2.ISecurityGroup
  public readonly elasticIp: ec2.CfnEIP

  public constructor(scope: Construct, id: string, props: MinecraftNetworkConstructProps) {
    super(scope, id)

    // -----------------------------
    // VPC
    // -----------------------------
    this.vpc = new ec2.Vpc(this, "Vpc", {
      maxAzs: 1,
      natGateways: 0,
      subnetConfiguration: [
        {
          name: "public",
          subnetType: ec2.SubnetType.PUBLIC
        }
      ]
    })

    // -----------------------------
    // Security Group
    // -----------------------------
    this.securityGroup = new ec2.SecurityGroup(this, "SecurityGroup", {
      vpc: this.vpc,
      description: "Security group for Minecraft server",
      // SSM、パッケージ更新、Mojang 配布物取得を行うため、PoC では outbound を広く許可する。
      allowAllOutbound: true
    })

    this.securityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(props.minecraftPort),
      "Allow Minecraft client connection"
    )

    // -----------------------------
    // Elastic IP
    // -----------------------------
    this.elasticIp = new ec2.CfnEIP(this, "ElasticIp", {
      domain: "vpc"
    })

    for (const [key, value] of Object.entries(props.standardTags)) {
      Tags.of(this.securityGroup).add(key, value)
      Tags.of(this.elasticIp).add(key, value)
      Tags.of(this.vpc).add(key, value)
    }
  }
}
