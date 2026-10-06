import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
    { ignores: ['dist/', 'coverage/', 'node_modules/', '_examples/'] },
    js.configs.recommended,
    tseslint.configs.recommended,
    {
        files: ['scripts/**/*.mjs', '*.config.js'],
        languageOptions: {
            globals: { process: 'readonly', console: 'readonly' },
        },
    },
);
