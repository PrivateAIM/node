<p align="center">
  <a href="https://github.com/PrivateAIM/node" target="_blank" rel="noopener noreferrer">
    <img src="https://raw.githubusercontent.com/PrivateAIM/node/master/.github/assets/icon.svg" alt="FLAME Node" height="100">
  </a>
</p>

<h1 align="center">@privateaim/node-message-broker 💬</h1>

<p align="center">
  <b>The node-side message broker for the FLAME platform.</b><br>
  Container-facing REST API, end-to-end crypto, and local delivery — relaying to the Hub durable mailbox.
</p>

<p align="center">
  <a href="https://github.com/PrivateAIM/node/actions/workflows/main.yml"><img src="https://github.com/PrivateAIM/node/actions/workflows/main.yml/badge.svg" alt="CI"></a>
  <img src="https://img.shields.io/badge/node-%E2%89%A524-3c873a?logo=node.js&logoColor=fff" alt="node >=24">
  <a href="https://github.com/PrivateAIM/node/blob/master/LICENSE"><img src="https://img.shields.io/badge/license-Apache%202.0-blue.svg" alt="license"></a>
</p>

<p align="center">
  <a href="https://docs.privateaim.net"><b>Documentation</b></a> &nbsp;·&nbsp;
  <a href="https://github.com/PrivateAIM/node">Monorepo</a> &nbsp;·&nbsp;
  <a href="https://github.com/PrivateAIM/hub">Hub</a>
</p>

---

Part of the **[FLAME Node](https://github.com/PrivateAIM/node)** monorepo — node-side (data-station)
services for the [PrivateAIM](https://privateaim.net) platform, alongside the central [Hub](https://github.com/PrivateAIM/hub).

A thin TypeScript service — the successor to the legacy Java `node-message-broker` — that owns only:

1. **Container-facing REST API** — the SDK-compatible surface the FLAME `flamesdk`
   talks to (auth: node-local Authup JWT, the analysis presents its `KEYCLOAK_TOKEN`).
2. **End-to-end crypto** — encrypt outbound / decrypt inbound (node-to-node ECDH +
   AES-256-GCM via `@privateaim/kit`'s `crypto/message`; per-message HKDF). The Hub
   only ever sees ciphertext.
3. **Hub link** — REST `send` / `pull` / `ack` against the Hub durable mailbox via
   `@privateaim/messenger-http-kit`, plus the SSE wakeup stream that triggers pulls.
4. **Local delivery** — webhook fan-out to the analysis container.
5. **Node-side analysis policy** — capability check (`ANALYSIS_SELF_MESSAGE_BROKER_USE`)
   + participant resolution via server-core.

Durability and routing live in the **Hub** broker; this service is an encrypt/decrypt
+ local-delivery adapter. See the design authority (Plan 013, Track B).

## Data flow

The broker is a thin encrypt/decrypt + local-delivery adapter in front of the Hub's
durable, analysis-agnostic mailbox. `analysisId` rides in message `metadata`; the Hub never
interprets it.

```
send:    Container ──REST──▶ Broker ──[seal per recipient, analysisId-bound]──▶ Hub /messages
notify:  Hub ──SSE "messagePending" (payload-free)──▶ Broker        (long-poll pull is the fallback)
pull:    Broker ──GET /messages (cursor, long-poll)──▶ Hub
deliver: Broker ──[open, decrypt]──▶ webhook POST to the analysis container
```

- **Send** — resolve the analysis participants (server-core), seal the payload **once per
  recipient** under that node's ECDH public key, and relay one Hub message per recipient.
- **Inbound** — a payload-free wakeup (or the long-poll fallback) triggers a pull; each
  message's **sender** node key is resolved, the frame is decrypted, and the plaintext is
  fanned out verbatim to the analysis's registered webhooks, then acked (delete-on-ack,
  at-least-once).
- **Crypto** — node-to-node ECDH (P-256) + per-message HKDF + AES-256-GCM via
  `@privateaim/kit`. `analysisId` is bound into the HKDF `info` on both `seal` and `open`,
  so a relabelled `metadata.analysisId` fails to decrypt rather than mis-routing.

## HTTP API

The container-facing surface (auth: node-local Authup JWT — the analysis presents its
`KEYCLOAK_TOKEN`). Every `/analyses/:id/*` route additionally requires the
`ANALYSIS_SELF_MESSAGE_BROKER_USE` capability and that the caller's client owns the analysis.
The surface is kept compatible with the FLAME `flamesdk` (verified against
[`python-sdk`](https://github.com/PrivateAIM/python-sdk)).

| Method &amp; path | Body | Response |
|---|---|---|
| `POST /analyses/:id/messages` | `{ recipients: string[] /* node ids */, message: <JSON> }` | `202`, empty |
| `POST /analyses/:id/messages/broadcast` | `{ message: <JSON> }` | `202`, empty |
| `GET /analyses/:id/participants` | — | `[{ nodeId, nodeType }]` (bare array) |
| `GET /analyses/:id/participants/self` | — | `{ nodeId, nodeType }` (`404` if absent) |
| `POST /analyses/:id/messages/subscriptions` | `{ webhookUrl }` | registered subscription |
| `GET /analyses/:id/messages/subscriptions` | — | `{ data, meta: { total } }` |
| `DELETE /analyses/:id/messages/subscriptions` | `{ webhookUrl }` | unregistered |
| `GET /healthz` | — | liveness (unauthenticated) |

`message` is an opaque JSON payload relayed verbatim — the SDK round-trips its own envelope
(`meta.id`, `sender`, …) inside it; the broker never mints ids or wraps the payload. Inbound
delivery is **webhook-push only** (no pull endpoint). Request bodies are validated with
validup + zod.

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
├── core/              # ports + domain logic (no infra imports)
│   ├── hub/           #   IHubClient — send / pull / ack / onWakeup
│   ├── crypto/        #   ICryptoService — seal / open
│   ├── delivery/      #   IDeliveryService — webhook registry + fan-out
│   ├── analysis/      #   participant resolver + analysis-scope policy
│   ├── authz/         #   capability-check gateway port
│   ├── messaging/     #   outbound send / broadcast orchestration
│   └── inbound/       #   inbound delivery loop (pull → decrypt → deliver → ack)
├── adapters/          # external implementations
│   ├── http/          #   routup controllers + permission-checker middleware
│   ├── hub/           #   HubClient + reconnecting SSE wakeup source
│   ├── crypto/        #   CryptoService over @privateaim/kit
│   ├── core/          #   server-core participant resolver
│   ├── authz/         #   Authup permission gateway + provider
│   └── delivery/      #   in-memory webhook delivery
└── app/               # orchestration — builder, factory, DI modules
    └── modules/       #   config · components · core-client · inbound · http
```

## License

Made with 💚

Published under [Apache 2.0](https://github.com/PrivateAIM/node/blob/master/LICENSE).
