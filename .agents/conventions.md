# Conventions

Mirrors the FLAME Hub repo. Only the deltas worth restating are below.

## Commit Messages

**Conventional Commits**, enforced by commitlint (`@tada5hi/commitlint-config`) + Husky:

```
type(scope): description

feat(node-message-broker): add webhook delivery
fix(node-message-broker): handle hub wakeup reconnect
chore: release
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `ci`, `build`.

Do **not** add AI-attribution trailers to commits.

## Linting

ESLint 10 with `@tada5hi/eslint-config` (flat config). `npm run lint` / `npm run lint:fix`.
Ignores: `dist`, `*.d.ts`, `node_modules`, `.nx`, `writable`.

## Pre-commit Hooks

Husky runs on every commit: **lint-staged** (ESLint --fix on `*.{js,ts}`) and
**commitlint** (message format).

## Build System

### Services

Built with **tsdown** (JS) + **tsc** (type declarations):

```bash
npm run build:js      # tsdown (bundle: false, preserves directory structure)
npm run build:types   # tsc --emitDeclarationOnly -p tsconfig.build.json
npm run build         # rimraf dist/ + both
```

Output: ESM (`dist/**/*.mjs`) preserving source structure + `.d.ts`. CLI entry at
`dist/cli/index.mjs`.

### Nx Orchestration

`dependsOn: ["^build"]` in `nx.json`; build/test/lint results are cached.

## TypeScript

- Root `tsconfig.build.json` extends `@tada5hi/tsconfig`; services set `strict: true`.
- ES2022, Module ESNext, ModuleResolution bundler, ESM-only (`"type": "module"`).
- Decorators enabled (`experimentalDecorators`, `emitDecoratorMetadata`) for routup controllers.
- **Naming**: interfaces are `I`-prefixed (`IHubClient`); types are not (`WebhookSubscription`).
- **Types/interfaces** live in `types.ts` in the same directory, never inline in module files.
- Prefer static imports; no dynamic imports for types. No `as any`.

## Published Dependencies

This repo consumes the **published** `@privateaim/*` and `@authup/*` packages (it does not
re-vendor Hub kits). Bump the pinned versions when the Hub publishes new contract releases —
in particular `@privateaim/messenger-kit` / `@privateaim/messenger-http-kit` for the broker
wire contracts.

## DI Modules

Each DI module lives in `app/modules/<name>/` with `constants.ts` (TypedToken keys),
`types.ts`, `module.ts`, `index.ts`. Module names are string constants on the module class.
`start.ts`/CLI is minimal — `createApplication()` + `app.setup()`; all wiring is in modules.
