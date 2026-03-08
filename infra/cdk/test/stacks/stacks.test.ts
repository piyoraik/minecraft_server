import assert from "node:assert/strict"
import test from "node:test"

import { App } from "aws-cdk-lib"
import { Match, Template } from "aws-cdk-lib/assertions"

import { loadAppConfig } from "../../lib/config/default"
import { ComputeStack } from "../../lib/stacks/compute-stack"
import { LambdaStack } from "../../lib/stacks/lambda-stack"
import { NetworkStack } from "../../lib/stacks/network-stack"

const asUnknownRecord = (value: unknown): Record<string, unknown> | null => {
  if (typeof value !== "object" || value === null) {
    return null
  }

  return value as Record<string, unknown>
}

const readFunctionName = (resource: unknown): string | undefined => {
  const resourceRecord = asUnknownRecord(resource)
  if (resourceRecord === null) {
    return undefined
  }

  const properties = asUnknownRecord(resourceRecord.Properties)
  if (properties === null || typeof properties.FunctionName !== "string") {
    return undefined
  }

  return properties.FunctionName
}

void test("NetworkStack は Minecraft 用ポートのみを公開する", () => {
  const app = new App()
  const config = loadAppConfig()
  const stack = new NetworkStack(app, "NetworkTest", { config })
  const template = Template.fromStack(stack)

  template.hasResourceProperties("AWS::EC2::SecurityGroup", {
    SecurityGroupIngress: Match.arrayWith([
      Match.objectLike({
        CidrIp: "0.0.0.0/0",
        FromPort: 25565,
        ToPort: 25565,
        IpProtocol: "tcp"
      })
    ])
  })
})

void test("NetworkStack は標準タグを付与する", () => {
  const app = new App()
  const config = loadAppConfig()
  const stack = new NetworkStack(app, "NetworkTagTest", { config })
  const template = Template.fromStack(stack)

  const vpcs = template.findResources("AWS::EC2::VPC")
  const vpc = Object.values(vpcs)[0]
  const properties = asUnknownRecord(vpc?.Properties)
  const tags = Array.isArray(properties?.Tags) ? properties.Tags : []

  assert(tags.some((tag) => {
    const record = asUnknownRecord(tag)
    return record?.Key === "Project" && record?.Value === "minecraft-server"
  }))
  assert(tags.some((tag) => {
    const record = asUnknownRecord(tag)
    return record?.Key === "Environment" && record?.Value === "dev"
  }))
  assert(tags.some((tag) => {
    const record = asUnknownRecord(tag)
    return record?.Key === "ManagedBy" && record?.Value === "cdk"
  }))
  assert(tags.some((tag) => {
    const record = asUnknownRecord(tag)
    return record?.Key === "Owner" && record?.Value === "minecraft-team"
  }))
})

void test("ComputeStack は deleteOnTermination=false の EBS を持つ", () => {
  const app = new App()
  const config = loadAppConfig()
  const network = new NetworkStack(app, "NetworkForComputeTest", { config })
  const compute = new ComputeStack(app, "ComputeTest", {
    config,
    vpc: network.vpc,
    securityGroup: network.securityGroup,
    elasticIp: network.elasticIp
  })
  const template = Template.fromStack(compute)

  template.hasResourceProperties("AWS::EC2::Instance", {
    BlockDeviceMappings: Match.arrayWith([
      Match.objectLike({
        Ebs: Match.objectLike({
          DeleteOnTermination: false,
          VolumeSize: 30,
          VolumeType: "gp3"
        })
      })
    ])
  })
})

void test("ComputeStack は SSM と CloudWatch Logs に必要な最小権限を付与する", () => {
  const app = new App()
  const config = loadAppConfig()
  const network = new NetworkStack(app, "NetworkForComputeIamTest", { config })
  const compute = new ComputeStack(app, "ComputeIamTest", {
    config,
    vpc: network.vpc,
    securityGroup: network.securityGroup,
    elasticIp: network.elasticIp
  })
  const template = Template.fromStack(compute)

  template.hasResourceProperties("AWS::IAM::Role", {
    ManagedPolicyArns: Match.arrayWith([
      Match.objectLike({
        "Fn::Join": Match.anyValue()
      })
    ])
  })

  template.hasResourceProperties("AWS::IAM::Policy", {
    PolicyDocument: {
      Statement: Match.arrayWith([
        Match.objectLike({
          Action: Match.arrayWith([
            "logs:CreateLogGroup",
            "logs:CreateLogStream",
            "logs:PutLogEvents"
          ]),
          Effect: "Allow"
        })
      ]),
      Version: "2012-10-17"
    }
  })
})

void test("ComputeStack は必要な Output を公開する", () => {
  const app = new App()
  const config = loadAppConfig()
  const network = new NetworkStack(app, "NetworkForComputeOutputTest", { config })
  const compute = new ComputeStack(app, "ComputeOutputTest", {
    config,
    vpc: network.vpc,
    securityGroup: network.securityGroup,
    elasticIp: network.elasticIp
  })
  const template = Template.fromStack(compute)

  template.hasOutput("InstanceId", {})
  template.hasOutput("InstancePublicIp", {})
  template.hasOutput("GracefulShutdownTimeout", {})
})

void test("LambdaStack は 3 つの Lambda 関数を作成する", () => {
  const app = new App()
  const config = loadAppConfig()
  const stack = new LambdaStack(app, "LambdaTest", { config })
  const template = Template.fromStack(stack)

  const resources = template.findResources("AWS::Lambda::Function")
  const functionNames = Object.values(resources).map((resource) => readFunctionName(resource))

  assert(functionNames.includes("minecraft-discord-handler"))
  assert(functionNames.includes("minecraft-command-processor"))
  assert(functionNames.includes("minecraft-player-event-processor"))
})

void test("LambdaStack は Lambda の LogGroup に retention と RemovalPolicy を設定する", () => {
  const app = new App()
  const config = loadAppConfig()
  const stack = new LambdaStack(app, "LambdaLogGroupTest", { config })
  const template = Template.fromStack(stack)

  template.hasResourceProperties("AWS::Logs::LogGroup", {
    LogGroupName: "/minecraft/lambda/discord-handler",
    RetentionInDays: 14
  })
  template.hasResource("AWS::Logs::LogGroup", {
    UpdateReplacePolicy: "Delete",
    DeletionPolicy: "Delete"
  })
})

void test("LambdaStack は Ansible 用 S3 バケットを作成する", () => {
  const app = new App()
  const config = loadAppConfig()
  const stack = new LambdaStack(app, "LambdaBucketTest", { config })
  const template = Template.fromStack(stack)

  template.resourceCountIs("AWS::S3::Bucket", 1)
})

void test("LambdaStack は S3 バケットで暗号化と公開ブロックを有効にする", () => {
  const app = new App()
  const config = loadAppConfig()
  const stack = new LambdaStack(app, "LambdaBucketSecurityTest", { config })
  const template = Template.fromStack(stack)

  template.hasResourceProperties("AWS::S3::Bucket", {
    BucketEncryption: {
      ServerSideEncryptionConfiguration: Match.arrayWith([
        Match.objectLike({
          ServerSideEncryptionByDefault: {
            SSEAlgorithm: "AES256"
          }
        })
      ])
    },
    PublicAccessBlockConfiguration: {
      BlockPublicAcls: true,
      BlockPublicPolicy: true,
      IgnorePublicAcls: true,
      RestrictPublicBuckets: true
    },
    VersioningConfiguration: {
      Status: "Enabled"
    }
  })
})

void test("LambdaStack は player stats 用 DynamoDB テーブルを作成する", () => {
  const app = new App()
  const config = loadAppConfig()
  const stack = new LambdaStack(app, "LambdaPlayerStatsTest", { config })
  const template = Template.fromStack(stack)

  template.hasResourceProperties("AWS::DynamoDB::Table", {
    KeySchema: [
      {
        AttributeName: "playerName",
        KeyType: "HASH"
      }
    ]
  })
})

void test("LambdaStack は stateful リソースに RemovalPolicy を設定する", () => {
  const app = new App()
  const config = loadAppConfig()
  const stack = new LambdaStack(app, "LambdaRemovalPolicyTest", { config })
  const template = Template.fromStack(stack)

  template.hasResource("AWS::DynamoDB::Table", {
    UpdateReplacePolicy: "Delete",
    DeletionPolicy: "Delete"
  })
  template.hasResource("AWS::S3::Bucket", {
    UpdateReplacePolicy: "Delete",
    DeletionPolicy: "Delete"
  })
  template.hasResource("AWS::SecretsManager::Secret", {
    UpdateReplacePolicy: "Delete",
    DeletionPolicy: "Delete"
  })
})

void test("LambdaStack は command processor に制御対象を絞った IAM を付与する", () => {
  const app = new App()
  const config = loadAppConfig()
  const stack = new LambdaStack(app, "LambdaIamTest", { config })
  const template = Template.fromStack(stack)

  template.hasResourceProperties("AWS::IAM::Policy", {
    PolicyDocument: {
      Statement: Match.arrayWith([
        Match.objectLike({
          Action: Match.arrayWith(["ec2:StartInstances", "ec2:StopInstances"]),
          Condition: {
            StringEquals: {
              "ec2:ResourceTag/Project": "minecraft-server"
            }
          }
        }),
        Match.objectLike({
          Action: Match.arrayWith([
            "ec2:DescribeInstances",
            "ssm:SendCommand",
            "ssm:GetCommandInvocation"
          ]),
          Effect: "Allow",
          Resource: "*"
        })
      ])
    }
  })
})

void test("LambdaStack は主要な運用 Output を公開する", () => {
  const app = new App()
  const config = loadAppConfig()
  const stack = new LambdaStack(app, "LambdaOutputTest", { config })
  const template = Template.fromStack(stack)

  template.hasOutput("DiscordHandlerFunctionUrl", {})
  template.hasOutput("DiscordHandlerFunctionName", {})
  template.hasOutput("CommandProcessorFunctionName", {})
  template.hasOutput("PlayerStatsTableName", {})
  template.hasOutput("AnsibleSsmBucketName", {})
})
