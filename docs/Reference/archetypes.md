# Archetypes

## Purpose

An **archetype** is an internal storage “table” that groups together all entities sharing the **same set of component types**. Archetypes are the core performance mechanism of this ECS: queries match archetypes first, then iterate rows inside them. 

---

## Storage model

### Table layout (SoA)

Archetypes store component data in **Structure of Arrays (SoA)** form:

* **one column per component type**
* each entity occupies a **row** across all columns 

This is the reason queries are efficient: iteration is over dense arrays rather than scattered objects. 

---

## Archetype membership

### Structural changes move entities between archetypes

When an entity’s component *set* changes, the entity moves to a different archetype:

* `add(e, Ctor, value)` is **structural** and *may move* the entity to another archetype 
* `remove(e, Ctor)` is **structural** and *may move* the entity to another archetype 

Non-structural updates do not change archetype membership:

* `set(e, Ctor, value)` updates the value but does not change the component set 

---

## Queries and archetypes

### Archetype filtering

`query(...ctors)` only iterates archetypes that contain *all* required component columns, then yields matching entity rows. 

### Query row shape

For `query(A, B, C)`, the yielded row contains:

* `e` (entity handle)
* `c1`, `c2`, `c3` component values in the same order as the ctor arguments 

---

## Safety constraints

### Structural changes during iteration

While iterating queries (and generally while systems run), doing structural changes directly can throw. The recommended pattern is:

* enqueue structural changes via `world.cmd()`
* apply them via `world.flush()` (or at the end of `world.update(dt)`) 

This matters because structural changes imply archetype moves. 

---

## Visibility / Public API

Archetypes are an **internal mechanism** (the public exports are `Types`, `TypeRegistry`, `Commands`, `World`, `Schedule`). Users interact with archetypes only indirectly through `World` operations and `query()`. 
