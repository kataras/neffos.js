import { defineConfig } from 'vitest/config';

export default defineConfig({
    define: {
        __NEFFOS_BROWSER_BUILD__: 'false',
    },
    test: {
        environment: 'node',
        include: ['tests/**/*.test.ts'],
        coverage: {
            provider: 'v8',
            include: ['src/**/*.ts'],
        },
    },
});
