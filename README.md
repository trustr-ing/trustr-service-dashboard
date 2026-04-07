# TRUSTr Service Dashboard

A web-based Nostr client for interacting with TRUSTr recommendation and trust-ranking services. Built with SvelteKit 2, Svelte 5, and TypeScript.

## Current State

The dashboard currently provides an HTTP-based exploration UI backed by the TRUSTr FastAPI server:

- `/query` — Parameterized query builder with NIP-07 signer login
- `/explore` — User recommendation browser (follow recs, timeline, feed)
- `/scatter` — Embedding projection visualization (PCA/UMAP clusters)

### Key Features

- **NIP-07 login** via browser extension (nos2x, Alby, etc.)
- **Lens selection** — switch between model codenames (each lens is a different trust/embedding snapshot)
- **Pool controls** — adjustable time window and density filtering for recommendations
- **Dark/light theme** with TRUSTr branding

## Tech Stack

- **SvelteKit 2.50** + **Svelte 5.51** + **TypeScript 5.9**
- **adapter-static** — builds to `../ui-dist` with `/ui` base path
- **nostr-tools 2.23** — NIP-07 signing, relay pool, event parsing
- **applesauce-core 5.1** — Nostr event utilities

## Development

```bash
pnpm install
pnpm dev        # dev server at localhost:5173
pnpm build      # static build to ../ui-dist
pnpm check      # type checking
```

The UI expects a TRUSTr API server at the configured base URL (see `src/lib/api/client.ts`).

## Roadmap

This dashboard is evolving toward a full NDE (Nostr Discovery Engine) orchestrator client:

- [ ] TSM event publishing — create and sign kind 37572 service requests via NIP-07
- [ ] SSE result streaming — consume kind 37573 ranked output events from `/tsm/request`
- [ ] Service chaining — output events from one request become input for another (`pov` as naddr, `type` matching result tags)
- [ ] Subscription management — saved request templates, monitoring of active requests
- [ ] Full Nostr-native mode — publish requests to relays, subscribe for results, no HTTP dependency
