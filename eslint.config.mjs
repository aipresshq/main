import eslint from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default [
  {
    ignores: ['dist/**', 'node_modules/**', '.astro/**', '.playwright-mcp/**'],
  },
  {
    files: ['src/**/*.ts', 'tests/**/*.mjs', 'admin/**/*.mjs', '*.mjs'],
    ...eslint.configs.recommended,
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
  },
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: ['src/**/*.ts'],
    languageOptions: {
      ...config.languageOptions,
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  })),
];
