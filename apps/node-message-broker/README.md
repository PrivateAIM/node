# @privateaim/node-message-broker

> Part of the [FLAME Node](../../README.md) monorepo — one of the node-side (data-station)
> services for the FLAME platform, alongside the central [Hub](https://github.com/PrivateAIM/hub).

The **node-side message broker** for the FLAME platform. It is the thin TypeScript
service that replaces the legacy Java `node-message-broker`. It owns only:

1. **Container-facing REST API** — the SDK-compatible surface the FLAME `flamesdk`
   talks to (auth: node-local Authup JWT, the analysis presents its `KEYCLOAK_TOKEN`).
2. **End-to-end crypto** — encrypt outbound / decrypt inbound (node-to-node ECDH +
   AES-256-GCM via `@privateaim/kit`'s `crypto/message`; per-message HKDF). The Hub
   only ever sees ciphertext.
3. **Hub link** — REST `send` / `pull` / `ack` against the Hub durable mailbox via
   `@privateaim/messenger-http-kit`, plus the SSE wakeup stream that triggers pulls.
4. **Local delivery** — webhook fan-out (default) + optional container pull.
5. **Node-side analysis policy** — capability check (`ANALYSIS_SELF_MESSAGE_BROKER_USE`)
   + participant resolution via server-core.

Durability and routing live in the **Hub** broker; this service is an encrypt/decrypt
+ local-delivery adapter. See the design authority (Plan 013, Track B).

## Status

Scaffold. The hexagonal skeleton, config, HTTP server, and webhook-subscription CRUD
are in place. The Hub link, crypto, participant resolution, and message send/pull
routes are Phase 4 (marked with `TODO`/stub in the code).

## Configuration

| Variable            | Default                     | Purpose                                              |
|---------------------|-----------------------------|------------------------------------------------------|
| `PORT`              | `3000`                      | HTTP listen port                                     |
| `AUTHUP_URL`        | `http://127.0.0.1:3010/`    | Node-local Authup (verifies inbound container JWTs)  |
| `HUB_URL`           | `http://127.0.0.1:3000/`    | Hub message-broker base URL (durable mailbox)        |
| `CORE_URL`          | `http://127.0.0.1:3001/`    | server-core base URL (participants + analysis creds) |
| `CLIENT_ID`         | `system`                    | Node client id (outbound `client_credentials`)       |
| `CLIENT_SECRET`     | `start123`                  | Node client secret                                   |
| `REALM`             | `master`                    | Node client realm                                    |
| `NODE_PRIVATE_KEY`  | —                           | Operator-held ECDH private key (hex PEM/SPKI)        |

## Scripts

```bash
npm run build      # rimraf dist + tsdown (js) + tsc (types)
npm run test       # vitest
npm run cli -- start
```

## Layout (hexagonal)

```
src/
├── core/            # ports — hub link, local delivery, analysis policy (no infra imports)
├── adapters/        # implementations — http controllers, hub client, delivery
└── app/             # orchestration — builder, factory, DI modules (config, components, http)
```
