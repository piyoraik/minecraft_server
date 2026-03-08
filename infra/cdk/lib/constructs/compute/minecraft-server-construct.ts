import { Stack, type Duration } from "aws-cdk-lib"
import * as ec2 from "aws-cdk-lib/aws-ec2"
import * as iam from "aws-cdk-lib/aws-iam"
import * as s3 from "aws-cdk-lib/aws-s3"
import { Construct } from "constructs"

type MinecraftServerConstructProps = {
  backupBucket: s3.IBucket
  elasticIp: ec2.CfnEIP
  gracefulShutdownTimeout: Duration
  instanceType: string
  securityGroup: ec2.ISecurityGroup
  vpc: ec2.IVpc
}

/**
 * Minecraft サーバー用 EC2 と付随 IAM を標準構成で作成する Construct。
 *
 * LinuxGSM と SSM 運用に必要な EC2 設定をここへ集約し、Stack は依存関係の接続だけを担う。
 */
export class MinecraftServerConstruct extends Construct {
  public readonly instance: ec2.IInstance

  public constructor(scope: Construct, id: string, props: MinecraftServerConstructProps) {
    super(scope, id)

    // -----------------------------
    // Instance Role
    // -----------------------------
    const instanceRole = new iam.Role(this, "InstanceRole", {
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
          `arn:${Stack.of(this).partition}:logs:${Stack.of(this).region}:${Stack.of(this).account}:log-group:/minecraft/ec2/*`,
          `arn:${Stack.of(this).partition}:logs:${Stack.of(this).region}:${Stack.of(this).account}:log-group:/minecraft/ec2/*:*`
        ]
      })
    )
    props.backupBucket.grantReadWrite(instanceRole)

    // -----------------------------
    // EC2 Instance
    // -----------------------------
    const instance = new ec2.Instance(this, "Instance", {
      vpc: props.vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC
      },
      securityGroup: props.securityGroup,
      role: instanceRole,
      instanceType: new ec2.InstanceType(props.instanceType),
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
    this.instance = instance

    // L2 では DisableApiTermination を直接触れないため、ここだけ L1 override を使う。
    instance.instance.addPropertyOverride("DisableApiTermination", false)

    instance.addUserData(
      "#!/bin/bash",
      "set -euo pipefail",
      "systemctl is-enabled amazon-ssm-agent >/dev/null || true",
      "systemctl start amazon-ssm-agent",
      `echo 'graceful-timeout=${props.gracefulShutdownTimeout.toSeconds()}' >/etc/minecraft-shutdown.conf`,
      "sleep 1"
    )

    // -----------------------------
    // Elastic IP Association
    // -----------------------------
    new ec2.CfnEIPAssociation(this, "ElasticIpAssociation", {
      allocationId: props.elasticIp.attrAllocationId,
      instanceId: instance.instanceId
    })
  }
}
