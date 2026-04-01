# Changelog

All notable changes to this project will be documented in this file.

---

## v1.0.0

### API Stabilization & Ergonomics

Goal: harden the public API surface before freezing `WorldApi`.

#### Breaking Changes

- **`spawnMany` renamed to `spawnWith`** — the old name was misleading (`spawnMany` implied spawning multiple entities, like `despawnMany`). `spawnWith` clearly conveys "spawn one entity with these components". Update all call sites: `world.spawnMany(...)` → `world.spawnWith(...)`, `cmd().spawnMany(...)` → `cmd().spawnWith(...)`.

#### New Features

- **`cmd().addMany()` / `cmd().removeMany()` as batched commands** — previously these methods decomposed into N individual `add`/`remove` commands, causing N archetype migrations on flush. They now enqueue a single `addMany` / `removeMany` command, matching the single-migration behaviour of the direct `world.addMany()` / `world.removeMany()` calls.

- **`world.destroy()` guard on all public methods** — after `world.destroy()` is called, every public method now throws `"Cannot use a destroyed World."` immediately. Previously only `spawn()` had this check; other methods produced confusing stale-entity errors or silently no-oped.

#### Audit Fixes

- **`@internal` leaks removed** — `_scheduleSystems`, `_getSystemCount`, and `_warnAboutLifecycleConflict` are no longer part of the public `WorldApi` interface.
- **`flatted` dependency bumped to `^3.4.2`** — resolves [GHSA-25h7-pfq9-p65f](https://github.com/advisories/GHSA-25h7-pfq9-p65f) (unbounded recursion DoS in `parse()` revive phase).
- `npm run lint` passes clean with no warnings.

#### Performance & Archetype Graph

- **Archetype graph edge cache** — add/remove transitions between archetypes are now cached (`addEdges` / `removeEdges` maps on each `Archetype`). Repeated single-component `add` / `remove` on the same type no longer re-compute `signatureKey` on hot paths.
- **Query result caching** — `_matchingArchetypes()` caches results per query signature. New archetypes are scanned incrementally; unchanged queries pay no rescan cost.
- **Benchmark suite** — baseline numbers for spawn throughput, query iteration, and component add/remove are tracked in `test/bench.bench.ts`.
- Per-entity allocations in `query()` reduced via V8 object-shape stability (per-arity `switch` branches).
- Documentation added for when to prefer `queryTables` vs `query` vs `queryEach`.

#### Query Filters

- **`without` exclusion filter** — exclude entities that have a given component: `world.query(Position, { without: [Dead] })`.
- **`with` presence filter** — require a component without reading its value (marker components): `world.query(Position, { with: [Active] })`.
- Filter support across all three query styles (`query`, `queryTables`, `queryEach`).
- Typed overloads and `QueryRow` / `QueryTable` types updated accordingly.

#### `WorldApi` Freeze

No breaking changes to `WorldApi` will be made after this release.

#### Documentation

- **Versioned docs** — documentation is now versioned using [mike](https://github.com/jimporter/mike). Each release tag (`v1.0.0`, `v1.1.0`, …) publishes a dedicated version at its own URL; the `latest` alias always points to the most recent stable release.
- **Preview channel** — every push to `master` deploys a live `preview` version of the docs, reflecting unreleased changes.
- **PDF per version** — each version (including `preview`) generates its own downloadable PDF.

---

## v0.6.1

### Security

Resolved two vulnerabilities via `npm audit fix` — both are transitive dependencies from the Jest / TypeScript ESLint toolchain.

| Package                            | Severity | Advisory                                                                                                                                                                                                                                       |
| ---------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ajv < 6.14.0`                     | Moderate | [GHSA-2g4f-4pwh-qvx6](https://github.com/advisories/GHSA-2g4f-4pwh-qvx6) — ReDoS when using `$data`                                                                                                                                           |
| `minimatch ≤ 3.1.3 / 9.0.0–9.0.6` | High     | [GHSA-3ppc-4f35-3m26](https://github.com/advisories/GHSA-3ppc-4f35-3m26), [GHSA-7r86-cg39-jmmj](https://github.com/advisories/GHSA-7r86-cg39-jmmj), [GHSA-23c5-xmqv-rm74](https://github.com/advisories/GHSA-23c5-xmqv-rm74) — Multiple ReDoS |

All tests and builds pass with no regressions after the update.

### Bug Fixes

#### `World.update()` — finally block robustness (`src/ecs/World.ts`)

If `flush()` threw inside the `finally` block (e.g. from a double-despawn), all subsequent statements were skipped, causing three cascading failures:

- `swapEvents()` was never called — events emitted that frame were delivered one frame late
- `_profAddPhase` and `_profEndFrame` were never called — `_frameCounter` incremented but history arrays were not pushed, breaking `stats()`
- If a system also threw, the system error was masked by the flush error

**Fix:** Wrapped `flush()` in its own `try/catch` so `swapEvents()`, `_profAddPhase`, and `_profEndFrame` always execute. A new test covers the flush-throws path.

#### `Schedule.run()` — profiling cleanup on system throw (`src/ecs/Schedule.ts`)

`_profBeginFrame(dt)` was called at the start of each run but there was no `try/finally` around the phase loop. If a system threw, `_profEndFrame()` and `updateOverlay()` were never called, causing `stats().frame` to permanently diverge from `statsHistory().size` and the overlay to stop rendering.

**Fix:** Added a `try/finally` around the phase loop, mirroring the pattern already used in `World.update()`.

#### Query generator — `_iterateDepth` leak on abandoned iterator (`src/ecs/World.ts`)

`world.query()` and `world.queryTables()` increment `_iterateDepth` on first `next()` and decrement it in a `finally` block. The `finally` only runs when the generator is exhausted or explicitly closed via `.return()` / `.throw()`. Callers who advanced the generator manually via `.next()` and dropped the reference without cleanup permanently leaked `_iterateDepth` until GC — during that window, every structural change threw `"Cannot do structural change while iterating"`, completely breaking the world.

> **Note:** `for...of` (including with `break`) is safe and remains the recommended pattern — it always calls `.return()` on early exit.

**Fix:** Added a `FinalizationRegistry` to detect abandoned generators and immediately decrement `_iterateDepth`.

### Upgrading

Drop-in patch release with no API changes.

- Run `npm audit fix` (or update to `0.6.1`) to pick up the security patches.
- No migration steps required.
- All existing `for...of` query patterns continue to work without changes.

---

## v0.6.0

### Schedule Upgrades, Debugging Tools, Zero-alloc Queries, World Snapshot/Restore

This release brings four major improvements focused on **performance, determinism, and developer experience**.

#### Schedule Upgrades

- Keep `Schedule.run(phases)` while adding:
  - **Before/after constraints**: `schedule.add(world, "sim", fn).after("input")`
  - **Phase order registration**: `schedule.setOrder([...])`
  - **Optional flush control**: automatic flush-after-phase points or manual flush mode

#### Debugging Tools (profiling + overlay)

- **Stats overlay** configurable via `new World({ statsOverlayOptions: ... })`
  - Supports position/size, thresholds (`targetFrameMs`, `slowFrameMs`), history size (`maxSamples`), and custom parent element
- **World stats APIs**
  - `world.stats()` → live counts + timing (entities, archetypes, systems, resources, events, pending commands; `frameMs`, `phaseMs`, `systemMs`, `dt`, `frame`)
  - `world.statsHistory()` → rolling arrays (`dt`, `frameMs`, `phaseMs`, `systemMs`)
- **Profiling controls**
  - `world.setProfilingEnabled(enabled)` toggles timing collection
  - `world.setProfilingHistorySize(frames)` changes history capacity
- **Overlay controls**
  - `world.setDebugging(enabled)` toggles overlay
  - `world.destroyOverlay()` removes overlay and listeners
  - `world.updateOverlay(stats, history)` manually redraws
- Overlay UI: draggable title bar, console logging toggle, collapse/expand, frame-time history graph and threshold legend

#### New Query APIs (zero/low alloc, additive)

- `world.queryTables(...ctors)` — yields per-archetype SoA tables, avoids per-entity object allocation
- `world.queryEach(...ctors, fn)` — iterates entities with a callback (no yielded objects)

#### World Snapshot / Restore (Save & Load)

Deterministic save/load via pure-data snapshots:

- `world.snapshot(): WorldSnapshot`
- `world.restore(snapshot: WorldSnapshot): void`

**Persisted (opt-in):** entities, components, resources.
**Not persisted:** systems, events, schedules/phases, commands/queues (rebuilt on load).

---

## v0.5.0

### Resources, Events, Better Typing, Bundle Helpers, Docs Site

This release focuses on **ergonomics and strong typing** while staying fast, simple, and backwards-compatible.

#### New: Resources (Singletons) + Events API

- **Resources**: one instance per type (Bevy-style singletons) — `setResource`, `getResource`, `requireResource`, `hasResource`, `removeResource`, `initResource`
- **Events**: emit during systems, drain/consume after a phase — `emit`, `events`, `drainEvents`, `clearEvents`, `swapEvents`

#### Improved: Strong Typing for `query()` Results

`query()` now infers component types so systems don't need `any`.

```ts
for (const { e, c1: pos, c2: vel } of world.query(Position, Velocity)) {
  // pos: Position, vel: Velocity — fully typed
}
```

Includes overloads up to 6 components.

#### Improved: `SystemFn` Typing

- Introduces the exported `WorldApi` interface.
- `SystemFn` now targets `WorldApi` so systems type-check cleanly without casts.

#### New: Bundle Helpers

- `world.spawnWith([Position, new Position()], [Velocity, new Velocity()])` — spawn one entity with multiple components
- `world.addMany(e, [Ctor, value], ...)` — add multiple components in one call
- `world.removeMany(e, CtorA, CtorB, ...)` — remove multiple components in one call

#### New: Documentation Site

Published via MkDocs and deployed to GitHub Pages: [https://piratejl.github.io/archetype-ecs-lib/](https://piratejl.github.io/archetype-ecs-lib/)

---

## v0.4.2

### Iteration Safety, Command Flushing, Diagnostics

Patch focused on **iteration safety**, **more predictable command flushing**, **better diagnostics**, and small internal performance wins. No API changes.

#### Fixed

- **Robust iteration lock** — iteration state is now tracked with a depth counter instead of a boolean, preventing a nested query from accidentally unlocking structural changes while an outer iteration is still running.
- **`flush()` forbidden during iteration** — calling `flush()` during iteration now throws the same way as `add`/`remove`/`despawn`.

#### Changed

- **`flush()` drains until stable** — `flush()` now repeatedly drains and applies commands until the queue is empty, supporting the `cmd().spawn(init)` pattern where `init` may enqueue further commands.

#### Improved

- **Better error context** — errors now include schedule phase name, entity id/gen, and component constructor name where applicable.

#### Performance

- `query()` reduces repeated allocations per call.
- `Commands.drain()` swaps buffers instead of copying.

#### Migration

No API changes. If your code called `flush()` inside a system while iterating it will now throw — move those structural updates to phase boundaries.

---

## v0.4.1

Initial public release on [npm](https://www.npmjs.com/package/archetype-ecs-lib).

- Create and despawn entities
- Register and query components
- Basic system loop via `world.addSystem()` / `world.update(dt)`
- Archetypes (tables) store entities in SoA layout (one column per component type)
- Queries iterate matching archetypes efficiently
- Commands defer structural changes (`spawn`/`despawn`/`add`/`remove`) safely
- Minimal `Schedule` runs systems by phase and flushes commands between phases
