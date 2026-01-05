# Components

## Purpose

A **component** is a unit of data attached to an `Entity`. In this ECS, components are stored in **archetypes (tables)** using a **Structure-of-Arrays (SoA)** layout: **one column per component type**. 

---

## Component “type” (key)

A component type is identified by a **constructor** (typically a class):

```ts
class Position { constructor(public x = 0, public y = 0) {} }
class Velocity { constructor(public x = 0, public y = 0) {} }
```

Any class used as a type key is considered a valid component type. 

### TypeId mapping

Internally, component constructors are mapped to a stable numeric **`TypeId`** via `typeId()`. 
`TypeId` assignment is **process-local** and based on **constructor identity** (via `WeakMap`). 

---

## Component “value”

The component value is the actual instance stored in the archetype column (e.g. `new Position(1,2)`).

* Values are stored per-archetype, per-column (SoA) 
* Queries return **direct references** to these values (you mutate them in place)

---

## World operations on components

All component operations are done through `World` using the component constructor as the key. 

### Presence / access

* `has(e, Ctor): boolean` 
* `get(e, Ctor): T | undefined` 

### Update (non-structural)

* `set(e, Ctor, value): void`
  Requires the component to exist; otherwise throws. 

### Structural changes

These may **move the entity between archetypes**:

* `add(e, Ctor, value): void` 
* `remove(e, Ctor): void` 

---

## Queries and component ordering

`world.query(A, B, C)` yields rows shaped like:

* `e`: the entity
* `c1`, `c2`, `c3`: component values in the **same order** as the ctor arguments 

Example:

```ts
for (const { e, c1: pos, c2: vel } of world.query(Position, Velocity)) { }
```

---

## Safety rules during iteration

While iterating a query (or while systems are running), **direct structural changes can throw**. Use deferred commands instead:

* enqueue via `world.cmd()`
* apply via `world.flush()` 
