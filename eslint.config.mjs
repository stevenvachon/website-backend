import { defineConfig } from 'eslint/config';
import globals from 'globals';
import js from '@eslint/js';
import security from 'eslint-plugin-security';

export default defineConfig([
  {
    files: ['**/*.{js,mjs,cjs}'],
    plugins: { js, security },
    extends: ['js/recommended', 'security/recommended'],
    languageOptions: { globals: globals.node },
  },
]);
