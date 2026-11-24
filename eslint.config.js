// The Clovervale project.
// Copyright 2026 imacat.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
// Authors:
//   imacat@mail.imacat.idv.tw (imacat), 2026/11/17
// AI assistance: Claude Code (Anthropic)

/**
 * @module eslint.config The ESLint configuration of all packages.
 */

import js from '@eslint/js';
import jsdoc from 'eslint-plugin-jsdoc';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

/** The header every source file must start with. */
const FILE_HEADER_PATTERN = new RegExp(
  [
    String.raw`^// The Clovervale project\.`,
    String.raw`// Copyright \d{4}(?:-\d{4})? imacat\.`,
    '//',
    String.raw`// Licensed under the Apache License, Version 2\.0 ` +
      String.raw`\(the "License"\);`,
    '// you may not use this file except in compliance with the ' +
      String.raw`License\.`,
    '// You may obtain a copy of the License at',
    '//',
    String.raw`//     http://www\.apache\.org/licenses/LICENSE-2\.0`,
    '//',
    '// Unless required by applicable law or agreed to in writing, software',
    '// distributed under the License is distributed on an "AS IS" BASIS,',
    '// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or' +
      String.raw` implied\.`,
    '// See the License for the specific language governing permissions and',
    String.raw`// limitations under the License\.`,
    '//',
    '// Authors:',
    String.raw`(?://   \S+ \(.+\), \d{4}/\d{1,2}/\d{1,2}\n)+` +
      String.raw`// AI assistance: Claude Code \(Anthropic\)\n`,
  ].join(String.raw`\n`),
);

/**
 * Requires every source file to start with the project file header.
 *
 * @type {import('eslint').Rule.RuleModule}
 */
const fileHeaderRule = {
  meta: {
    type: 'problem',
    docs: { description: 'Require the project file header.' },
    messages: {
      missing: 'The file must start with the project file header.',
    },
    schema: [],
  },
  create(context) {
    return {
      Program(node) {
        if (!FILE_HEADER_PATTERN.test(context.sourceCode.text)) {
          context.report({
            node,
            loc: { line: 1, column: 0 },
            messageId: 'missing',
          });
        }
      },
    };
  },
};

export default defineConfig(
  globalIgnores([
    '**/dist/',
    'docs/api/',
    'release/',
    'coverage/',
    'excludes/',
  ]),
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  jsdoc.configs['flat/recommended-typescript-error'],
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      clovervale: { rules: { 'file-header': fileHeaderRule } },
    },
    rules: {
      'clovervale/file-header': 'error',
      // The project writes the types in JSDoc, even in TypeScript.
      'jsdoc/no-types': 'off',
      'jsdoc/require-param-type': 'error',
      'jsdoc/require-returns-type': 'error',
      'jsdoc/require-hyphen-before-param-description': ['error', 'always'],
      'jsdoc/tag-lines': ['error', 'never', { startLines: 1 }],
      'jsdoc/require-file-overview': [
        'error',
        {
          tags: {
            module: {
              initialCommentsOnly: true,
              mustExist: true,
              preventDuplicates: true,
            },
          },
        },
      ],
      'jsdoc/require-jsdoc': [
        'error',
        {
          publicOnly: true,
          require: {
            ArrowFunctionExpression: true,
            ClassDeclaration: true,
            ClassExpression: true,
            FunctionDeclaration: true,
            FunctionExpression: true,
            MethodDefinition: true,
          },
          contexts: [
            'PropertyDefinition',
            'TSEnumDeclaration',
            'TSInterfaceDeclaration',
            'TSMethodSignature',
            'TSPropertySignature',
            'TSTypeAliasDeclaration',
            'VariableDeclaration',
          ],
        },
      ],
    },
  },
  {
    // JavaScript files have no other way to state their types.
    files: ['**/*.js'],
    rules: {
      'jsdoc/check-tag-names': ['error', { typed: false }],
    },
  },
);
