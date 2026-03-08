import { App, type StackProps } from "aws-cdk-lib"

import { loadAppConfig } from "../lib/config/default"
import { applyStandardTags } from "../lib/helpers/tags"
import { ComputeStack } from "../lib/stacks/compute-stack"
import { LambdaStack } from "../lib/stacks/lambda-stack"
import { NetworkStack } from "../lib/stacks/network-stack"

const app = new App()
const config = loadAppConfig()

const account = process.env.CDK_DEFAULT_ACCOUNT
const region = process.env.CDK_DEFAULT_REGION ?? config.region

const stackProps: StackProps = account
  ? {
      env: {
        account,
        region
      }
    }
  : {}

applyStandardTags(app, config)

const networkStack = new NetworkStack(app, "Network", {
  ...stackProps,
  config
})

const computeStack = new ComputeStack(app, "Compute", {
  ...stackProps,
  config,
  vpc: networkStack.vpc,
  securityGroup: networkStack.securityGroup,
  elasticIp: networkStack.elasticIp
})
computeStack.addDependency(networkStack)

new LambdaStack(app, "Lambda", {
  ...stackProps,
  config
})
