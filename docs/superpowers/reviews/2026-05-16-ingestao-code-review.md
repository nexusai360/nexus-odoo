---
phase: F2-ingestao
reviewed: 2026-05-16T20:56:13Z
depth: standard
files_reviewed: 22
files_reviewed_list:
  - prisma/schema.prisma
  - prisma/seed.ts
  - scripts/gen-raw-models.ts
  - src/app/(protected)/configuracao/configuracao-content.tsx
  - src/app/(protected)/configuracao/page.tsx
  - src/lib/actions/sync-config.ts
  - src/lib/constants/nav.ts
  - src/lib/validations/sync-config.ts
  - src/worker/catalog/model-catalog.ts
  - src/worker/fatos/fato-estoque-saldo.ts
  - src/worker/index.ts
  - src/worker/jobs.ts
  - src/worker/odoo/client.ts
  - src/worker/odoo/errors.ts
  - src/worker/prisma.ts
  - src/worker/sync/incremental.ts
  - src/worker/sync/processors.ts
  - src/worker/sync/reconcile.ts
  - src/worker/sync/snapshot.ts
  - src/worker/sync/sync-config.ts
  - src/worker/sync/sync-engine.ts
  - src/worker/sync/sync-state.ts
findings:
  critical: 3
  warning: 9
  info: 6
  total: 18
status: issues_found
---

# Phase F2: Code Review Report — Ingestão / Cache

**Reviewed:** 2026-05-16T20:56:13Z
**Depth:** standard
**Files Reviewed:** 22
**Status:** issues_found

## Summary

F2 builds the Odoo ingestion machine: a BullMQ worker syncing the Tauga ERP via JSON-RPC into 79 raw JSONB tables plus a provisional `fato_estoque_saldo`, with a super_admin-only `/configuracao` screen. The RBAC on the config screen and its server actions is solid (page-level redirect plus per-action role check — defense in depth). SQL injection is not a practical concern because all writes flow through the Prisma client API with no raw SQL and no dynamic identifiers crossing into a query string.

However, the review found real correctness defects: the incremental sync watermark is advanced even when only a subset of records was fetched (data-loss risk on pagination/partial failure), the snapshot full-refresh discards all cache data before confirming the new pull succeeded, and the JSON-RPC client leaks the Odoo password into logs/state on error. Several concurrency and failure-isolation gaps weaken the "no exception escapes" guarantee the engine claims.

## Critical Issues

### CR-01: Incremental sync watermark advances even on partial/failed page fetch — silent data loss

**File:** `src/worker/sync/incremental.ts:31-50`, `src/worker/sync/sync-state.ts:19-34`, `src/worker/sync/processors.ts:38-46`
**Issue:** `syncIncremental` reads `now = new Date()` *before* paging through Odoo. `markOk` then stores a fresh `new Date()` as `lastIncrementalAt`. The next cycle filters with `write_date > lastIncrementalAt`. Two compounding problems:
1. Records written in Odoo *between* the start of paging and the `markOk` timestamp are skipped forever — `markOk` uses its own `new Date()`, which is strictly later than any record the cycle could have seen. The watermark should be the cycle start time, not the completion time.
2. `searchReadPaged` makes N sequential RPC calls. If page 3 of 5 throws, the exception propagates to `runModelCycle` → `markError` — good. But the *non-monotonic* risk: because the watermark is the completion time and not derived from the actual max `write_date` processed, any record modified during the (potentially minutes-long) multi-page pull is lost on success.

**Fix:** Capture the watermark at cycle start and pass it explicitly, or derive it from the data:
```ts
export async function syncIncremental(client, raw, odooModel, since): Promise<{ count: number; watermark: Date }> {
  const cycleStart = new Date();
  const domain = since ? [["write_date", ">", odooDatetime(since)]] : [];
  const records = (await client.searchReadPaged(odooModel, domain)) as Record<string, unknown>[];
  // ... upserts ...
  return { count: records.length, watermark: cycleStart };
}
```
and have `markOk` persist the passed `watermark` rather than calling `new Date()` itself.

### CR-02: Snapshot full-refresh deletes the entire cache table inside a transaction that holds it empty for the whole reload — and any post-delete failure leaves an empty table

**File:** `src/worker/sync/snapshot.ts:14-34`
**Issue:** The current order is: (1) pull all records from Odoo *outside* the transaction, (2) open a transaction, `deleteMany`, then `createMany`. The pull-first ordering is correct, but two issues remain:
- If `createMany` fails (e.g. a row violates a constraint, payload too large, connection drop mid-batch), the transaction rolls back — acceptable. But `createMany` of potentially tens of thousands of JSONB rows in a single statement can exceed Postgres parameter limits or statement size; there is no batching. A failure here means the snapshot model is marked `erro` and the *old* data is still intact only because of rollback — that part is fine — but a silent partial is possible if Prisma splits the call.
- More importantly: there is **no row count / sanity check**. If Odoo returns 0 records due to a transient permission glitch that does *not* surface as an AccessError (e.g. a domain that silently returns empty), `deleteMany` wipes the table and `createMany` is skipped, leaving `fato_estoque_saldo` (rebuilt right after) empty. The dashboard then shows zero stock.

**Fix:** Batch `createMany` (e.g. chunks of 1000) and add a guard: if the fresh pull returns 0 rows but the table currently has >0, skip the wipe and mark `erro` instead, so a transient empty result cannot destroy the cache.
```ts
const existing = await raw.count();
if (rows.length === 0 && existing > 0) {
  throw new OdooError(`snapshot ${odooModel}: pull vazio com cache não-vazio — abortado`);
}
```

### CR-03: Odoo password leaks into error messages, RPC fault payloads, and worker logs

**File:** `src/worker/odoo/client.ts:72,91-102`, `src/worker/odoo/errors.ts:10-17`
**Issue:** `executeKw` puts `this.password` into the `args` array of every `object.execute_kw` call. When `rpc` fails after all retries it throws `OdooError(\`${service}.${method} falhou após ${this.retries} tentativas: ${lastExc}\`)`. If `lastExc` is a `fetch`/network error whose message or stack includes the request — or if any logging upstream serializes the args — the password is exposed. More concretely: `OdooRpcFault` (errors.ts:14) does `JSON.stringify(error)` of the raw Odoo error payload; Odoo error payloads (`data.debug`) frequently echo back the failing call including arguments, and `execute_kw`'s argument list *starts with* `[db, uid, password, ...]`. That `debug` string is then stored verbatim into `SyncState.lastError` (truncated to 500 chars) and rendered on the `/configuracao` Estado tab to super_admins. The Odoo password is reachable in the database and the UI.
**Fix:** Never let the password reach a serialized error. Redact before storing/logging:
```ts
function redact(s: string): string {
  return s.split(this.password).join("***");
}
```
Apply in `rpc`'s catch, in `OdooRpcFault`'s constructor (strip `debug`/`message` of the secret), and in `markError`. Better: pass credentials per-call but scrub them from any captured exception before it escapes `rpc`.

## Warnings

### WR-01: Worker overlap guard is in-process only — no protection against a second worker instance or a restart mid-cycle

**File:** `src/worker/index.ts:22,70-82`
**Issue:** `emAndamento` is a module-level `Set`. With `concurrency: 1` on a single worker it prevents overlap of the *same job name*, but: (a) if the worker is ever scaled to 2 replicas (the architecture in CLAUDE.md anticipates Portainer/Docker), both run cycles concurrently and double-write the cache; (b) the guard is in memory, so a crash mid-cycle leaves `SyncState.lastStatus = "rodando"` forever with no lock to clear. The `markRunning` status is cosmetic, not a lock.
**Fix:** Use a BullMQ/Redis-backed lock (e.g. a `SETNX` key per job name with a TTL) so overlap protection survives restarts and is cluster-safe.

### WR-02: `markRunning` / `markOk` / `markError` use `prisma.syncState.update` which throws if the row is missing — breaks failure isolation for an uncatalogued model

**File:** `src/worker/sync/sync-state.ts:12-48`, `src/worker/sync/sync-engine.ts:23-35`
**Issue:** `runModelCycle` calls `markRunning` first, inside the `try`. If the `SyncState` row for that model does not exist (seed not run, or a model added to `MODEL_CATALOG` after the last seed), `update` throws `P2025`. The catch then calls `markError`, which *also* does `update` on the same missing row and throws again — this second throw escapes `runModelCycle` entirely, violating the documented "nenhuma exceção escapa" guarantee and aborting the whole cycle loop in `processors.ts`.
**Fix:** Use `upsert` in the `mark*` helpers, or wrap the catch body so a failing `markError` cannot escape.

### WR-03: `runner` in `processIncrementalCycle` uses `findUniqueOrThrow` inside the runner — its throw is caught, but misclassified

**File:** `src/worker/sync/processors.ts:39`
**Issue:** If the `SyncState` row is missing, `findUniqueOrThrow` throws a Prisma `P2025`. `runModelCycle` catches it, `isAccessError` returns false, so it is recorded as a generic `erro` with a Prisma internal message in `lastError`. Combined with WR-02 this produces confusing operator-facing errors. The runner should not be the place a missing state row is discovered.
**Fix:** Resolve/seed the `SyncState` row up front in the processor loop (upsert before running), so the runner can assume it exists.

### WR-04: `config-check` reschedules jobs every 60s unconditionally — `upsertJobScheduler` churn and a 60s..120s blind window

**File:** `src/worker/index.ts:30-51,91-99`
**Issue:** Every minute `aplicarAgendamento` re-reads config and calls `upsertJobScheduler` three times even when nothing changed. Functionally tolerable, but: there is no change detection, so every reschedule may reset the scheduler's next-run clock depending on BullMQ internals, potentially delaying cycles indefinitely if the check interval is near the cycle interval. Also a config change takes up to 60s to apply (acceptable per spec) — but the UI copy promises "em até 1 minuto" while the worst case is up to the full 60s plus the in-flight cycle.
**Fix:** Cache the last-applied config; only call `upsertJobScheduler` when a value actually changed.

### WR-05: `searchReadPaged` does not pass `order` — pagination by offset over an unordered result set can skip or duplicate rows

**File:** `src/worker/odoo/client.ts:104-124`
**Issue:** Paged `search_read` with `offset`/`limit` but no `order` relies on Odoo returning a stable default ordering across calls. If records are inserted/deleted between page fetches (very likely on a live ERP during a multi-page incremental pull), offset paging silently skips or double-reads rows. Double-reads are harmless (upsert is idempotent) but skips mean lost records.
**Fix:** Pass an explicit stable sort, e.g. `order: "id asc"`, in the kwargs.

### WR-06: RPC retry loop swallows the abort/timeout and retries even non-retryable HTTP errors; `resp.json()` on a non-2xx body is unguarded

**File:** `src/worker/odoo/client.ts:39-73`
**Issue:** (a) `resp` is never checked for `resp.ok`. A 500/404/auth-redirect returns a body that may not be JSON; `await resp.json()` then throws a `SyntaxError`, which is caught and retried 3× — wasteful and masks the real cause. (b) A `4xx` (e.g. bad credentials returning HTTP error) is retried pointlessly. (c) On timeout, `ctrl.abort()` produces an `AbortError` that is retried with exponential backoff — fine — but the final `OdooError` message interpolates `${lastExc}` which for an `AbortError` is opaque.
**Fix:** Check `resp.ok`; for 4xx throw immediately without retry; only retry 5xx/network/timeout.

### WR-07: `parseWriteDate` is duplicated verbatim in `incremental.ts` and `snapshot.ts`

**File:** `src/worker/sync/incremental.ts:25-29`, `src/worker/sync/snapshot.ts:4-8`
**Issue:** Identical function copied into two files; divergence risk. Also the parse assumes Odoo always returns UTC naive datetimes — true for `write_date`, but undocumented here.
**Fix:** Extract to a shared `odoo/datetime.ts` and document the UTC assumption.

### WR-08: `processReconcileCycle` runs reconcile for every catalog model including `estatico` ones, and `searchIds([])` fetches all IDs for 79 models with no batching

**File:** `src/worker/sync/processors.ts:83-101`, `src/worker/sync/reconcile.ts:12-26`
**Issue:** Reconcile iterates the full catalog with no `mode` filter. For `estatico` models reconcile is wasteful but harmless. The real concern: `searchIds(model, [])` pulls every ID of every model on each reconcile cycle in one RPC — for large fiscal tables (`sped.documento.item`, etc.) that can be a very large array in a single response with no paging. If the response is truncated by an Odoo server limit, `vivos` is incomplete and `reconcileModel` will mark *live* records as `rawDeleted: true` — a correctness bug.
**Fix:** Page `searchIds` (Odoo `search` honors `offset`/`limit`); only run reconcile for non-`estatico` models if static data never gets deleted.

### WR-09: `getSyncConfig` / `readSyncConfig` accept whatever JSON is in `AppSetting.value` — a non-numeric value silently falls back without surfacing corruption

**File:** `src/lib/actions/sync-config.ts:21-25`, `src/worker/sync/sync-config.ts:22-32`
**Issue:** `AppSetting.value` is `Json`. `getSyncConfig` does `Number(byKey.get(...) ?? default)` — if the stored value is a string or object, `Number()` yields `NaN`, and `NaN` is then shown in the UI input and could be saved back. `readSyncConfig` (worker) guards with `typeof === "number" && > 0`, so worker and UI disagree on validation. Inconsistent contract.
**Fix:** Validate `AppSetting` reads with a Zod schema in both places; on invalid stored data, fall back to defaults *and* log a warning.

## Info

### IN-01: `OdooClient.version()` is dead code

**File:** `src/worker/odoo/client.ts:75-77`
**Issue:** `version()` is exported on the class but never called anywhere in F2.
**Fix:** Remove, or keep only if a health-check uses it.

### IN-02: `throttleMs` sleep runs even on the error path of a retry

**File:** `src/worker/odoo/client.ts:63`
**Issue:** `await sleep(this.throttleMs)` is after a successful `resp.json()` but before the `body.error` check — minor; throttle on a faulted response is fine, just slightly odd placement.
**Fix:** Cosmetic; optionally move the throttle to a `finally` or before the next loop iteration.

### IN-03: Magic numbers for default intervals duplicated across three files

**File:** `src/lib/actions/sync-config.ts:22-24`, `src/worker/sync/sync-config.ts:10-14`, `prisma/seed.ts` (odoo settings use different keys)
**Issue:** Defaults `3 / 1440 / 1440` appear in `getSyncConfig` and `SYNC_CONFIG_DEFAULTS`. The seed file seeds *unrelated* keys (`odoo.sync_interval_seconds`) that no longer match the F2 key scheme (`sync.incremental_interval_min`), so a fresh DB has no `sync.*` rows and both UI and worker silently use code defaults.
**Fix:** Seed the actual `sync.*_interval_min` keys, and import `SYNC_CONFIG_DEFAULTS` as the single source of truth.

### IN-04: `seed.ts` seeds every `SyncState` with `lastStatus: "rodando"`

**File:** `prisma/seed.ts:99-103`
**Issue:** A freshly seeded, never-synced model shows status "rodando" in the Estado tab, misleading the operator into thinking a sync is in progress.
**Fix:** Seed with a neutral status (e.g. add a `pendente` enum value, or leave default and document it).

### IN-05: `configuracao-content.tsx` number input allows empty / NaN form state

**File:** `src/app/(protected)/configuracao/configuracao-content.tsx:151-153`
**Issue:** `onChange={() => setForm({ ...form, [key]: Number(e.target.value) })}` — clearing the field makes `Number("")` → `0`, and the input has `min={1}` but no client-side enforcement before submit. The server Zod schema rejects `< 1` so it fails safely, but the user only sees a generic "Falha ao salvar" toast with no field-level message.
**Fix:** Guard against `NaN`/empty and surface Zod field errors in the toast.

### IN-06: `gen-raw-models.ts` is a one-shot generator with no guard against schema drift

**File:** `scripts/gen-raw-models.ts:13-28`
**Issue:** The 79 raw models in `schema.prisma` were generated once from `MODEL_CATALOG`. If the catalog changes, the schema silently drifts until someone re-runs the script manually.
**Fix:** Add a CI check that re-runs the generator and diffs against `schema.prisma`, or document the regeneration step in a runbook.

---

## Overall Assessment

The RBAC story is genuinely sound — page redirect plus per-action `super_admin` checks plus nav filtering, defense in depth, and no SQL injection surface since everything goes through the Prisma client API. The architecture (catalog-driven cycles, failure-isolated `runModelCycle`, pull-before-wipe snapshot) is well-structured.

But three Critical defects must be fixed before this ships: the incremental watermark advances to completion time and loses any record modified during a multi-page pull (CR-01); the snapshot has no empty-result guard, so a transient empty pull destroys the cache and zeroes the dashboard (CR-02); and the Odoo password is reachable in `SyncState.lastError` and the `/configuracao` UI via unredacted error payloads (CR-03). The Warnings — especially the cluster-unsafe overlap guard (WR-01), the cascading-throw failure-isolation hole (WR-02), and unpaged/unordered Odoo reads that can skip or wrongly-delete records (WR-05, WR-08) — should be resolved before relying on this in production. Recommend a fix pass on all three Criticals plus WR-01/WR-02/WR-05/WR-08, then re-review.

_Reviewed: 2026-05-16T20:56:13Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
