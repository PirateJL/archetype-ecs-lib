# Entity

## Purpose

An **Entity** is a lightweight, opaque handle used to reference rows stored inside archetypes. It is **not** the data itself (components hold the data). 

---

## Type

```ts
type Entity = { id: number; gen: number };
```

* `id`: stable numeric slot identifier
* `gen`: **generation counter** used to detect stale handles after despawn / reuse 

---

## Semantics

### Identity

An entity handle is considered valid only if **both**:

* the `id` refers to an allocated slot
* the `gen` matches the current generation for that slot 

### Stale handles

If an entity is despawned and the `id` is later reused, the `gen` will differ. This prevents accidentally operating on “the new entity that reused the same id”. 

---

## Where entities come from

* `world.spawn()` returns an `Entity` handle 
* `world.query(...)` yields rows that include `e: Entity` 

---

## Where entities are used

Entities are passed into World operations (examples):

* lifecycle: `despawn(e)`
* components: `add(e, Ctor, value)`, `remove(e, Ctor)`, `get(e, Ctor)`, `set(e, Ctor, value)` 
* commands (deferred): `cmd.despawn(e)`, `cmd.add(e, ...)`, `cmd.remove(e, ...)` 

---

## Related behavior

### Safety during iteration

When iterating query results (which contain `e: Entity`), structural changes should be deferred via commands and applied with `flush()`. 
