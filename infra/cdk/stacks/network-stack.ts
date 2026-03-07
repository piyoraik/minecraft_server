import { CfnOutput, Stack, type StackProps, Tags } from "aws-cdk-lib"
import * as ec2 from "aws-cdk-lib/aws-ec2"
import type { Construct } from "constructs"

const PROJECT_TAG_VALUE = "minecraft-server"
const MINECRAFT_PORT = 25565

/**
 * Minecraft サーバー用のネットワーク境界を定義する。
 * 1AZ の public subnet 構成に限定し、PoC の運用を単純化している。
 */
export class NetworkStack extends Stack {
  public readonly vpc: ec2.Vpc
  public readonly securityGroup: ec2.SecurityGroup
  public readonly elasticIp: ec2.CfnEIP

  public constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props)

    this.vpc = new ec2.Vpc(this, "MinecraftVpc", {
      maxAzs: 1,
      natGateways: 0,
      subnetConfiguration: [
        {
          name: "public",
          subnetType: ec2.SubnetType.PUBLIC
        }
      ]
    })

    this.securityGroup = new ec2.SecurityGroup(this, "MinecraftSecurityGroup", {
      vpc: this.vpc,
      description: "Security group for Minecraft server",
      allowAllOutbound: true
    })

    this.securityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(MINECRAFT_PORT),
      "Allow Minecraft client connection"
    )

    this.elasticIp = new ec2.CfnEIP(this, "MinecraftElasticIp", {
      domain: "vpc"
    })

    Tags.of(this.securityGroup).add("Project", PROJECT_TAG_VALUE)
    Tags.of(this.elasticIp).add("Project", PROJECT_TAG_VALUE)

    new CfnOutput(this, "SecurityGroupId", {
      value: this.securityGroup.securityGroupId
    })

    new CfnOutput(this, "ElasticIpAllocationId", {
      value: this.elasticIp.attrAllocationId
    })
  }
}
