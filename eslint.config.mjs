import { globSync } from "node:fs";
import { fileURLToPath } from "node:url";

import eslint from "@eslint/js";
import importPlugin from "eslint-plugin-import";
import globals from "globals";
import tseslint from "typescript-eslint";

const appPackages = ["@latchkey/api", "@latchkey/web", "@latchkey/worker"];
const workspaceManifest = (directory) => fileURLToPath(new URL(`./${directory}/`, import.meta.url));
// Every workspace package.json directory, so a test file can import whatever its own package
// depends on. A test file matches both its package's block and the shared **/*.test.ts block
// below; without this, the test block's own packageDir would win and hide the package's real
// dependencies (a test could only import root's, even for a package with its own hono, aws-sdk...).
const allWorkspaceManifests = globSync("{apps,packages}/*/package.json", {
  cwd: import.meta.dirname
}).map((manifest) => workspaceManifest(manifest.replace(/package\.json$/, "")));

const externalDependencyRule = (packageDir) => [
  "error",
  {
    devDependencies: ["**/*.config.*"],
    packageDir
  }
];

export default tseslint.config(
  {
    ignores: [
      "**/.next/**",
      "**/coverage/**",
      "**/dist/**",
      "**/node_modules/**",
      "eslint.config.mjs",
      "infra/index.mjs",
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
          allowDefaultProject: ["*.mjs", "infra/*.mjs"]
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
    files: ["apps/api/**/*.{js,mjs,cjs,ts,mts,cts}"],
    rules: {
      "import/no-extraneous-dependencies": externalDependencyRule(workspaceManifest("apps/api"))
    }
  },
  {
    files: ["apps/worker/**/*.{js,mjs,cjs,ts,mts,cts}"],
    rules: {
      "import/no-extraneous-dependencies": externalDependencyRule(workspaceManifest("apps/worker"))
    }
  },
  {
    files: ["packages/delivery/**/*.{js,mjs,cjs,ts,mts,cts}"],
    rules: {
      "import/no-extraneous-dependencies": externalDependencyRule(
        workspaceManifest("packages/delivery")
      )
    }
  },
  {
    files: ["**/*.test.{ts,mts,cts}"],
    rules: {
      "import/no-extraneous-dependencies": [
        "error",
        {
          devDependencies: true,
          packageDir: [import.meta.dirname, ...allWorkspaceManifests]
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
