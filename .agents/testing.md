# Testing

## Framework

**Vitest** with SWC transpilation (`unplugin-swc`) for fast TypeScript compilation —
identical to the Hub repo.

## Running Tests

```bash
npm run test                 # all packages (Nx)
npx nx test node-message-broker
```

## Test Configuration

Each package with tests has `test/vitest.config.ts`:

```typescript
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: { include: ['test/unit/**/*.spec.ts'] },
    plugins: [swc.vite()],
});
```

Test files live in `test/unit/` and use the `.spec.ts` extension, grouped by domain
(`test/unit/<layer>/<area>/*.spec.ts`).

## Fakes Over Mocks

**Always prefer fake implementations over `vi.fn()` / `vi.mock()`.** The hexagonal
architecture makes every dependency injectable via a port interface — write a class that
implements the port with in-memory behaviour and call-recording helpers. If a dependency
isn't injectable via a port, that's a signal the architecture isn't fully hexagonal yet
and should be fixed. Reuse the shared fakes from `@privateaim/server-test-kit` where they
apply.

## Writing Tests

- Place test files in `test/unit/**/*.spec.ts`.
- Use `@faker-js/faker` (or `node:crypto`'s `randomUUID`) for test data.
- Test core services against fakes of their ports (`IHubClient`, `IDeliveryService`, …).
