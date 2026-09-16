import eslint from "@eslint/js";
import importPlugin from "eslint-plugin-import";
import globals from "globals";
import tseslint from "typescript-eslint";

const appPackages = ["@latchkey/api", "@latchkey/web", "@latchkey/worker"];

export default tseslint.config(
  {
    ignores: [
      "**/.next/**",
      "**/coverage/**",
      "**/dist/**",
      "**/node_modules/**",
      "eslint.config.mjs",
      "**/playwright-report/**",
      "**/test-results/**"
    ]
  },
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    files: ["**/*.{js,mjs,cjs,ts,mts,cts}"],
    languageOptions: {
      globals: {
        ...globals.node
      },
      parserOptions: {
        projectService: {
          allowDefaultProject: ["*.mjs"]
        },
        tsconfigRootDir: import.meta.dirname
      }
    },
    plugins: {
      import: importPlugin
    },
    rules: {
      "import/no-cycle": "error",
      "import/no-extraneous-dependencies": [
        "error",
        {
          devDependencies: ["**/*.config.*"]
        }
      ],
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: appPackages,
              message: "Packages must not import applications."
            },
            {
              group: ["apps/*"],
              message: "Packages must not import applications."
            }
          ]
        }
      ]
    }
  },
  {
    files: ["**/*.test.{ts,mts,cts}"],
    rules: {
      "import/no-extraneous-dependencies": [
        "error",
        {
          devDependencies: true,
          packageDir: import.meta.dirname
        }
      ]
    }
  },
  {
    files: ["packages/core/src/**/*.{ts,mts,cts}"],
    ignores: ["**/*.test.*", "**/*.spec.*"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["node:*", "@latchkey/*", "apps/*"],
              message: "packages/core may only import Zod schemas."
            }
          ]
        }
      ]
    }
  }
);
