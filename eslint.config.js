// ESLint flat config shared by both Angular workspaces (map/frontend, portal/frontend).
//
// Role: enforces the Angular style guide via angular-eslint plus typescript-eslint's
// recommended rules. Formatting is left to Prettier.
//
// Usage:
//   npm run lint          # from the repo root
//   npm run lint -- --fix

// @ts-check
const eslint = require('@eslint/js');
const tseslint = require('typescript-eslint');
const angular = require('angular-eslint');

/**
 * Builds a config block enforcing a workspace's selector prefix (from its angular.json).
 *
 * @param {string} dir Workspace directory, relative to the repo root.
 * @param {string} prefix Selector prefix for that workspace's components and directives.
 * @return {import('eslint').Linter.Config} Config block scoped to `dir`'s TypeScript files.
 *
 * Usage: selectorPrefixRules('map/frontend', 'map')
 */
function selectorPrefixRules(dir, prefix) {
  return {
    files: [`${dir}/**/*.ts`],
    rules: {
      '@angular-eslint/directive-selector': [
        'error',
        { type: 'attribute', prefix, style: 'camelCase' },
      ],
      '@angular-eslint/component-selector': [
        'error',
        { type: 'element', prefix, style: 'kebab-case' },
      ],
    },
  };
}

module.exports = tseslint.config(
  {
    ignores: ['**/dist/**', '**/.angular/**', '**/coverage/**', 'pre_development/**'],
  },
  {
    files: ['**/*.ts'],
    extends: [
      eslint.configs.recommended,
      ...tseslint.configs.recommended,
      ...tseslint.configs.stylistic,
      ...angular.configs.tsRecommended,
    ],
    processor: angular.processInlineTemplates,
  },
  selectorPrefixRules('map/frontend', 'map'),
  selectorPrefixRules('portal/frontend', 'portal'),
  {
    files: ['**/*.html'],
    extends: [...angular.configs.templateRecommended, ...angular.configs.templateAccessibility],
  },
);
