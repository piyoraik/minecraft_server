import eslint from "@eslint/js"
import { defineConfig } from "eslint/config"
import tseslint from "typescript-eslint"
import cdkPlugin from "eslint-cdk-plugin"

export default defineConfig([
  {
    ignores: ["dist/**", "cdk.out/**"]
  },
  eslint.configs.recommended,
  {
    files: ["**/*.ts"],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    }
  },
  {
    files: ["bin/**/*.ts", "lib/**/*.ts", "stacks/**/*.ts", "constructs/**/*.ts"],
    extends: [cdkPlugin.configs.recommended]
  }
])
