import { Tags } from "aws-cdk-lib"
import type { IConstruct } from "constructs"

import type { AppConfig } from "../config/types"

export const applyStandardTags = (scope: IConstruct, config: AppConfig): void => {
  for (const [key, value] of Object.entries(config.tags)) {
    Tags.of(scope).add(key, value)
  }
}
