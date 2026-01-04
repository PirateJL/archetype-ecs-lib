# Query — Reference

## Purpose

A **Query** iterates all entities that have **all required component types**, efficiently by scanning only the **matching archetypes (tables)**. 

---

## API

### `world.query(...ctors): Iterable<QueryRow>`

`ctors` is a list of component constructors (types) you want to require.

```ts
for (const row of world.query(Position, Velocity)) {
  // ...
}
```

Queries yield rows shaped like: 

* `e`: the `Entity`
* `c1`, `c2`, `c3`, …: component values **in the same order** as the `ctors` arguments

So `query(A, B, C)` yields `{ e, c1: A, c2: B, c3: C }`. 

---

## Row mapping and ordering

### Deterministic component fields

The mapping is positional:

* `query(A)` → `{ e, c1 }`
* `query(A, B)` → `{ e, c1, c2 }`
* `query(A, B, C)` → `{ e, c1, c2, c3 }`

And `cN` always corresponds to the Nth constructor you passed. 

---

## Safety rules during iteration

While iterating a query (or while systems are running), **structural changes** (spawn/despawn/add/remove) can throw.

Use:

* `world.cmd()` to defer changes
* `world.flush()` (or `world.update()`) to apply them safely 

---

## Example

```ts
for (const { e, c1: pos, c2: vel } of world.query(Position, Velocity)) {
    pos.x += vel.x;
    pos.y += vel.y;

    // Safe structural change: defer it
    if (pos.x > 10) world.cmd().despawn(e);
}
```

This pattern is recommended explicitly for queries. 
