# Why deferred commands exist in an archetype ECS

In an archetype ECS, **deferred commands** (a command buffer) are not a “nice-to-have”. They exist because **the fastest storage model makes certain mutations unsafe during iteration**. The library API expresses this directly with `world.cmd()`, `world.flush()`, and `Schedule.run(...)/flush barriers`. 

---

## Archetypes are tables, and queries walk those tables

An archetype ECS stores entities in **tables**:

* one archetype = one *component set*
* one row = one entity
* one column per component type (SoA) 

A query like `world.query(Position, Velocity)` does not “scan entities”.
It first selects archetypes that contain the required component columns, then iterates **dense rows** in those tables. 

This density is where the performance comes from.

---

## The core problem: structural changes move entities between tables

A **structural change** is anything that changes the component *set* of an entity:

* `spawn()`
* `despawn(e)`
* `add(e, Ctor, value)`
* `remove(e, Ctor)`

In an archetype ECS, `add/remove` usually means:

1. remove the entity’s row from its current archetype table
2. insert a row into another archetype table
3. update internal bookkeeping (where the entity lives now)

That is fundamentally different from `set(e, Ctor, value)`, which just updates a value *inside the same row/column*.

So: **structural change = table move**.

---

## Why it’s unsafe to do structural changes during a query

When you iterate a query, you are conceptually doing:

* “for each matching archetype table”
* “for each row index in that table”
* “read columns at that row”

If you structurally change any entity during this loop, you can break the iteration invariants:

### 1) Swap-remove can invalidate the current row

Many archetype implementations remove rows with **swap-remove** (O(1)): the last row is swapped into the removed row index.

If you remove entity A at row `i`, entity B may be swapped into row `i`.

* If your loop then increments `i`, entity B might be **skipped**.
* Or processed twice depending on iteration strategy.

### 2) Moving entities changes which archetypes match

Adding/removing a component can move an entity into or out of the set of archetypes that the query is iterating.

If you mutate membership while iterating:

* you can end up iterating an archetype that didn’t exist in the matching set at the start
* or miss entities that moved into a matching archetype

### 3) Internal indices can become stale mid-loop

The library `World` tracks where an entity lives (which archetype + row). A structural change updates those indices. If you mutate while holding references from the iteration, you can end up with:

* stale row pointers
* stale bookkeeping
* inconsistent state if multiple mutations occur

Even if you “think it works”, it’s fragile and will eventually bite.

---

## Deferred commands are the solution: separate “read/iterate” from “mutate structure”

A command buffer enforces a clean two-step model:

1. **During iteration**: read data, compute decisions, mutate *component values* (safe)
2. **At a safe boundary**: apply structural changes in a batch (safe)

That’s exactly what the library documents:

* `world.cmd()` enqueues structural operations 
* `world.flush()` applies queued commands 
* `world.update(dt)` runs systems, then flushes at frame end 
* `Schedule.run(...)` flushes **between phases**, providing deterministic barriers 

This is why deferred commands exist: they preserve **iteration correctness** without giving up **table-based performance**.

---

## Why flushing in phases is architecturally important

The library `Schedule` explicitly flushes after each phase. 

This is not just “nice ordering”. It creates **deterministic points** where the world’s structure is allowed to change.

Example mental model:

* **Input phase**: decide spawns/despawns based on input → enqueue commands
* **Flush**: apply those spawns so they exist for simulation
* **Simulation phase**: move things, detect collisions → enqueue structural changes
* **Flush**: apply spawns/despawns/removals before render
* **Render phase**: build render data from a stable world snapshot

That separation reduces “action at a distance” bugs and makes debugging easier:

* “why does entity exist in sim but not render?” → check which phase flushed it.

---

## What you gain by deferring

### Correctness

* No skipped entities
* No double-processing due to swap-remove effects
* Stable iteration semantics

### Determinism

* Structural changes occur at explicit boundaries
* Easier to reason about ordering

### Performance

* Keeps archetype iteration tight and cache-friendly
* Batching structural operations reduces churn

---

## What to do inside a system

Inside a system (or a query loop), follow this rule:

* ✅ mutate component values directly (e.g. `pos.x += ...`)
* ✅ enqueue structural changes via `cmd()`
* ❌ don’t call structural `World` ops directly mid-iteration

---

## Summary: the “why” in one sentence

Deferred commands exist because **archetype queries iterate dense tables**, and **structural changes move rows between tables**, which can invalidate iteration—so we **queue structural changes** and apply them at **safe flush boundaries** (`flush()` / schedule phases). 
