import assert from "node:assert/strict"
import test from "node:test"

import { App } from "aws-cdk-lib"
import { Match, Template } from "aws-cdk-lib/assertions"

import { ComputeStack } from "../lib/compute-stack"
import { LambdaStack } from "../lib/lambda-stack"
import { NetworkStack } from "../lib/network-stack"

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

test("NetworkStack は Minecraft 用ポートのみを公開する", () => {
  const app = new App()
  const stack = new NetworkStack(app, "NetworkStackTest")
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

test("ComputeStack は deleteOnTermination=false の EBS を持つ", () => {
  const app = new App()
  const network = new NetworkStack(app, "NetworkStackForCompute")
  const compute = new ComputeStack(app, "ComputeStackTest", {
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

test("LambdaStack は 3 つの Lambda 関数を作成する", () => {
  const app = new App()
  const stack = new LambdaStack(app, "LambdaStackTest")
  const template = Template.fromStack(stack)

  template.resourceCountIs("AWS::Lambda::Function", 3)

  const resources = template.findResources("AWS::Lambda::Function")
  const functionNames = Object.values(resources).map((resource) => readFunctionName(resource))

  assert(functionNames.includes("minecraft-discord-handler"))
  assert(functionNames.includes("minecraft-command-processor"))
  assert(functionNames.includes("minecraft-player-event-processor"))
})

test("LambdaStack は Ansible 用 S3 バケットを作成する", () => {
  const app = new App()
  const stack = new LambdaStack(app, "LambdaStackBucketTest")
  const template = Template.fromStack(stack)

  template.resourceCountIs("AWS::S3::Bucket", 1)
})

test("LambdaStack は player stats 用 DynamoDB テーブルを作成する", () => {
  const app = new App()
  const stack = new LambdaStack(app, "LambdaStackPlayerStatsTest")
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
