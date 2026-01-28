# Why archetype ECS?

An **archetype ECS** organizes entities into **tables** where every entity in a table shares the same component set, stored in **SoA** form (one column per component). This library explicitly follows this model: “Archetypes (tables) store entities in a SoA layout… Queries iterate matching archetypes efficiently… Commands defer structural changes…” 

The “why” is mostly about making the *common case* (systems that iterate lots of entities with the same components) extremely fast and predictable.

---

## Cache locality

Most game/sim systems look like:

* “for all entities with `Position` and `Velocity`, update position”
* “for all entities with `Transform` and `Renderable`, build render data”

With archetypes, those entities live together in a table, and each component is a dense column:

* `Position[]` contiguous
* `Velocity[]` contiguous

So the CPU reads memory sequentially, which is what caches and prefetchers love. That’s the practical meaning of **cache locality**: fewer cache misses, more work per nanosecond.

In the library, this is literally the storage promise: SoA archetype tables + queries over matching archetypes. 

---

## Branch elimination (and “no-join” iteration)

In many ECS designs, the core loop must constantly ask:

* “does this entity have Velocity?”
* “if yes, fetch it; if not, skip”

That creates branches and scattered memory access.

With archetypes, the *membership check is moved up*:

1. pick archetypes that already contain all required components
2. iterate their rows

Inside the inner loop, there’s no per-entity “has component?” branching—every row is guaranteed to match. The API reflects that by querying required component types and yielding direct component references (`c1`, `c2`, …). 

This is what people mean by **branch elimination** in archetype ECS: fewer conditional checks in the hot loop, more straight-line code.

---

## Predictable iteration

Archetype iteration tends to be predictable because:

* You iterate dense arrays (rows/columns), not sparse IDs.
* Results are shaped consistently (`e`, `c1`, `c2`, … in argument order). 
* Structural changes are controlled: this library emphasizes deferring structural changes via `cmd()` and applying them at `flush()` points. 
* `Schedule` adds explicit “phase barriers” by flushing between phases, making the world structure stable during each phase’s iteration. 

That predictability is less about “deterministic order of entities” and more about **deterministic rules for when the world can change shape**.

---

## Comparison with sparse-set ECS

A **sparse-set ECS** typically stores each component type separately (often as a dense array + sparse index by entity id). It’s excellent for:

* fast lookup for a single component type (`Position` alone)
* cheap per-component iteration
* simple storage and often cheaper structural changes for *single* components

But when a system needs **multiple components** (`Position + Velocity + Mass + Forces`), sparse-set often needs some form of **join**:

* iterate one component pool, check membership in the others
* or intersect sets / hop through indirections

That can introduce:

* more branching (`if has(...)`)
* more random memory access (chasing indices across pools)

Archetypes flip that trade-off:

* multi-component iteration is the “happy path” (no join inside the hot loop)
* but structural changes can be more expensive because adding/removing a component may move an entity between tables. 

### Rule of thumb

* If your game spends most time in **systems that read/write several components per entity**, archetypes tend to shine.
* If your workload is lots of **single-component iteration** and **high churn** (constant add/remove), sparse-set can be simpler and sometimes cheaper.

---

## The real trade-off (why it’s not “always archetypes”)

Archetype ECS wins by making the hot loops fast, but it pays for it with:

* **structural churn cost** (moving entities between tables on add/remove)
* **many archetypes** if you have lots of component combinations
* a stronger need for **command buffering + flush boundaries** to keep iteration safe. 

That’s why a “full ECS” architecture often includes commands + scheduling: it’s the natural partner to archetype storage.
