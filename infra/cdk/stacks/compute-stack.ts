import { CfnOutput, Duration, Stack, type StackProps, Tags } from "aws-cdk-lib"
import * as ec2 from "aws-cdk-lib/aws-ec2"
import * as iam from "aws-cdk-lib/aws-iam"
import type { Construct } from "constructs"

const PROJECT_TAG_VALUE = "minecraft-server"
const DEFAULT_INSTANCE_TYPE = "t3.medium"

export type ComputeStackProps = StackProps & {
  vpc: ec2.IVpc
  securityGroup: ec2.ISecurityGroup
  elasticIp: ec2.CfnEIP
}

/**
 * Minecraft サーバー本体を載せる EC2 を定義する。
 * LinuxGSM が x86_64 前提のため、Amazon Linux 2023 x86_64 に固定している。
 */
export class ComputeStack extends Stack {
  public readonly instance: ec2.Instance

  public constructor(scope: Construct, id: string, props: ComputeStackProps) {
    super(scope, id, props)

    const instanceRole = new iam.Role(this, "MinecraftInstanceRole", {
      assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
      description: "Instance role for Minecraft EC2"
    })

    instanceRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMManagedInstanceCore")
    )

    instanceRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"],
        resources: [
          `arn:${this.partition}:logs:${this.region}:${this.account}:log-group:/minecraft/ec2/*`,
          `arn:${this.partition}:logs:${this.region}:${this.account}:log-group:/minecraft/ec2/*:*`
        ]
      })
    )

    const instanceType = this.node.tryGetContext("instanceType") ?? DEFAULT_INSTANCE_TYPE

    this.instance = new ec2.Instance(this, "MinecraftInstance", {
      vpc: props.vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC
      },
      securityGroup: props.securityGroup,
      role: instanceRole,
      instanceType: new ec2.InstanceType(instanceType),
      machineImage: ec2.MachineImage.latestAmazonLinux2023({
        cpuType: ec2.AmazonLinuxCpuType.X86_64
      }),
      blockDevices: [
        {
          deviceName: "/dev/xvda",
          volume: ec2.BlockDeviceVolume.ebs(30, {
            volumeType: ec2.EbsDeviceVolumeType.GP3,
            deleteOnTermination: false,
            encrypted: true
          })
        }
      ]
    })

    this.instance.instance.addPropertyOverride("DisableApiTermination", false)

    this.instance.addUserData(
      "#!/bin/bash",
      "set -euo pipefail",
      "systemctl is-enabled amazon-ssm-agent >/dev/null || true",
      "systemctl start amazon-ssm-agent",
      "sleep 1"
    )

    new ec2.CfnEIPAssociation(this, "MinecraftElasticIpAssociation", {
      allocationId: props.elasticIp.attrAllocationId,
      instanceId: this.instance.instanceId
    })

    Tags.of(this.instance).add("Project", PROJECT_TAG_VALUE)

    new CfnOutput(this, "InstanceId", {
      value: this.instance.instanceId
    })

    new CfnOutput(this, "InstancePublicIp", {
      value: this.instance.instancePublicIp
    })

    new CfnOutput(this, "GracefulShutdownTimeout", {
      value: Duration.seconds(60).toHumanString()
    })
  }
}
