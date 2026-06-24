import config from '@tada5hi/eslint-config';

export default [
    ...await config(),
    {
        ignores: [
            '**/dist/**',
            '**/*.d.ts',
            '**/node_modules/**',
            '**/.nx/**',
            '**/writable/**',
        ],
    },
];
