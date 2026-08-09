# Start VI 2027

Personal Thai-stock investment ledger — by Supasit.A

**Live:** https://start-vi-2027.supasiao.workers.dev/

> Local-first: data lives in each browser's IndexedDB, not synced across
> devices/browsers. The URL above just makes the same app reachable from
> anywhere — it doesn't share data between them.

## Development

```
npm install
npm run dev      # Vite dev server
npm test         # run Vitest once
npm run build    # production build -> dist/
```

Pushing to `main` (after `build-and-test` passes) auto-deploys via GitHub
Actions + Wrangler — see `.github/workflows/ci.yml` and `wrangler.jsonc`.
