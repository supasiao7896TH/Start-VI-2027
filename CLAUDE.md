# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```
npm install
npm run dev            # Vite dev server (hot reload)
npm run build           # production build -> dist/
npm run preview         # serve the dist/ build locally
npm test                # run all Vitest tests once
npm run test:watch      # Vitest watch mode
```

Run a single test file: `npx vitest run tests/ledger-engine.test.js`
Run a single test by name: `npx vitest run -t "test name substring"`

Pushing to `main` runs CI (`.github/workflows/ci.yml`): `build-and-test` (npm ci → build → test)
must pass before the `deploy` job runs `wrangler deploy` to Cloudflare Workers. There is no
staging environment — a green push to `main` goes straight to production at
https://start-vi-2027.supasiao.workers.dev/.

## Architecture

**Local-first, no backend.** All data lives in the browser's IndexedDB (`src/modules/db.js`,
DB name `startvi2027`). There is no server and no sync between browsers/devices — the deployed
URL just makes the same static app reachable from anywhere.

**Core invariant: derived data is never stored.** Holdings, Realized P&L, Cash Summary,
Unrealized P&L, Scorecard totals, and Valuation results are all *computed on the fly* from raw
data (Transactions, Price Snapshots, Scorecard criteria/inputs) — never persisted or cached.
When adding a feature, resist the urge to store a computed value; add a pure function instead.

### Module layout

- `src/main.js` — entry point, calls `APP_CORE.init()`.
- `src/modules/app-core.js` — orchestrator. All DOM event wiring, form handling, and
  cross-module coordination lives here. This is the file to read first to understand how a user
  action flows through the app.
- `src/modules/state-store.js` — a small reactive Pub/Sub store (`STATE_STORE`). Holds raw
  `transactions`/`priceSnapshots`/`scorecards` loaded from storage plus `computed` (always the
  latest `LEDGER_ENGINE.replay()` output — never edited directly) and UI-only filter state.
- **Engine modules (pure functions, the business logic, covered by Vitest):**
  - `ledger-engine.js` — `LEDGER_ENGINE.replay(transactions)` replays the full transaction list
    (sorted by date/createdAt/id) into `{ holdings, realizedPnL, totalRealizedPnL, cashSummary }`
    using the Average Cost method (see `docs/adr/0001-average-cost-basis-method.md`). Handles all
    7 transaction types (see `TRANSACTION_TYPES`): Buy, Sell, Cash Dividend, Cash
    Deposit/Withdrawal, Manual Adjustment, Stock Split, Stock Dividend.
  - `fee-calculator.js` — broker commission/SET fee/VAT math for net cash in/out on Buy/Sell.
  - `valuation-engine.js` — Unrealized P&L, DPS auto-suggestion from dividend history, and the 4
    valuation methods (DCF, P/E Relative, Graham Number, DDM) plus the guided FCF/share
    calculator. `calculateAllValuations` silently skips any method whose required inputs aren't
    all present yet — don't add errors for partially-filled forms.
  - `scorecard-engine.js` — the 15-item VI Scorecard (`SCORECARD_CRITERIA`, 4 categories, 0/2
    binary scoring) and `suggestQuantifiableCriteria`, which auto-suggests the 4 criteria that
    are objectively computable from data already entered.
- **Storage modules** (`storage-engine.js`, `price-storage.js`, `scorecard-storage.js`) — thin
  CRUD wrappers per IndexedDB object store, all built on `db.js`'s shared `openDB()`/
  `promisifyRequest()`. All object stores are created in `db.js`'s single `onupgradeneeded`
  handler — IndexedDB requires this; adding a store means bumping `APP_CONFIG.DB_VERSION` and
  guarding creation with `objectStoreNames.contains()` so existing user data survives.
- **Renderer modules** (`ui-renderer.js`, `decision-support-renderer.js`) — DOM rendering only,
  no state or business logic. Export `el()`/`formatMoney()`/`emptyState()` helpers reused across
  both.
- `app-config.js` — frozen constants (DB name/version, fee rates with their source cited inline,
  locale/currency). `fee-settings.js` stores the user-editable commission rate in `localStorage`.

### Domain model

`CONTEXT.md` is the glossary (Ledger, Transaction, Holding, Realized/Unrealized P&L, Corporate
Action, VI Scorecard Entry, etc.) — read it before introducing new domain terminology, and update
it in place when a term's definition changes. `docs/adr/` holds architecture decisions (currently
just the Average Cost vs FIFO choice). The VI Scorecard and Valuation formulas are sourced from
the `vi-analysis` skill (§22.4–22.5), not invented — check that skill before changing scoring
rules or valuation formulas.

### Frontend pattern

Single `index.html` (Tailwind via CDN `<script>`, no build-time CSS) with all markup/forms
inline; JS is entirely ES modules under `src/`. Third-party libraries stay as CDN `<script>` tags
rather than npm imports (see `index.html` head). Inline `onclick`/`onchange` handlers reference
functions attached to `window` at the end of `app-core.js`'s `init()` — ES modules don't expose
globals automatically, so any new inline handler needs an explicit `window.foo = ...` assignment.

### PWA

`vite.config.js` configures `vite-plugin-pwa` (Workbox `generateSW` mode, `registerType:
'autoUpdate'`) — manifest and service worker are generated entirely at build time into `dist/`,
not hand-written. Cache invalidation is handled automatically via Workbox's precache manifest, so
there's no `CACHE_NAME` to bump manually when shipping changes. Icons are generated from the
single source `public/icon-source.svg` via `@vite-pwa/assets-generator` (`npx
@vite-pwa/assets-generator -p minimal public/icon-source.svg`, run manually, output committed) —
re-run it if the source SVG changes.

### Testing

Vitest tests live in `tests/`, one file per engine/storage module, using `environment: 'node'`
(see `vitest.config.js`) with `fake-indexeddb`'s `IDBFactory` reassigned to `global.indexedDB` in
`beforeEach` for storage-module tests. Tests focus on the engine/storage modules (business logic
and persistence), not the DOM renderers.
