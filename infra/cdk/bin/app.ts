import { App, type StackProps } from "aws-cdk-lib"

import { ComputeStack } from "../stacks/compute-stack"
import { LambdaStack } from "../stacks/lambda-stack"
import { NetworkStack } from "../stacks/network-stack"

const DEFAULT_REGION = "ap-northeast-1"

const app = new App()

const account = process.env.CDK_DEFAULT_ACCOUNT
const region = process.env.CDK_DEFAULT_REGION ?? DEFAULT_REGION

const stackProps: StackProps = account
  ? {
      env: {
        account,
        region
      }
    }
  : {}

const networkStack = new NetworkStack(app, "NetworkStack", stackProps)

const computeStack = new ComputeStack(app, "ComputeStack", {
  ...stackProps,
  vpc: networkStack.vpc,
  securityGroup: networkStack.securityGroup,
  elasticIp: networkStack.elasticIp
})
computeStack.addDependency(networkStack)

new LambdaStack(app, "LambdaStack", stackProps)
