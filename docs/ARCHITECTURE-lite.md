# Architecture (public overview)

A deliberately high-level map of the code: **what the parts are and how they
fit together**. It says nothing about deployments, runtime configuration,
credentials, thresholds or operational state — those are kept in private
notes, not in this public repository.

## Shape

| Path | What it is |
|---|---|
| `apps/web` | The React + Vite front end and its serverless API (`apps/web/api`) |
| `apps/mobile` | Expo client that renders the same web UI inside a WebView and adds native playback protection |
| `apps/pages-proxy` | Small static proxy used for quick page previews |
| `apps/worker-video` | A media worker for one storage provider |
| `backend/video-worker` | A media worker for another storage provider, with range requests and signed grants |
| `packages/bridge` | Typed messages exchanged between the web UI and the native shell |
| `packages/core` | Shared Supabase client factory and shared types |
| `packages/playback-token` | The signed, short-lived playback grant (HMAC + encryption) |
| `packages/video-source` | Provider interface: how a video source is described and played |
| `packages/tokens` | Design tokens shared by web and mobile |
| `supabase/migrations` | The database schema, applied in order by a human |
| `scripts` | Verification, logging and maintenance tooling |
| `tools/upload-lesson` | Encoding and upload pipeline for lesson media |

## The tier concept

A lesson can be served by more than one source, and the code is written so the
**most protected source is tried first** and the others are fallbacks:

1. **worker** — a Worker fetches the media and holds the file reference inside
   a signed, short-lived grant, so the browser never receives a file id.
2. **direct** — the API hands the browser a file id plus a public-by-design
   browser key so the file can be fetched straight from the provider.
3. **embed** — a normal third-party embed.

The client asks for the first tier and falls back when a tier does not produce
a playable source. Fallbacks are **read-only** requests: they never consume a
view and never weaken the entitlement check that already happened.

## API conventions

- Every handler under `apps/web/api` is a self-contained serverless function:
  no relative or workspace imports, because the platform bundler cannot follow
  them in that folder.
- A handler answers `{ ok: false, code, ar, en }` on failure, where `code` is
  registered in [`docs/API-ERROR-CODES.md`](API-ERROR-CODES.md), and
  `{ ok: true, ... }` on success.
- The front end never builds a media URL itself — the API is the only source
  of a playable reference.
- Logging follows one schema across web, API and database layers; see
  [`docs/LOGGING.md`](LOGGING.md).

## Running it locally

```bash
npm install            # workspaces: web, mobile, packages
npm run dev            # web dev server
npm run dev -w @kinetech/mobile
npm run test:unit      # vitest across the workspaces
npm run test:e2e       # playwright
npm run build          # web build
npm run lint           # oxlint
bash scripts/verify.sh quick    # the fast local gate
bash scripts/verify.sh full     # the complete local gate
```

Environment variable **names** are listed in `.env.example` and
`apps/mobile/.env.example`; values are never committed.
