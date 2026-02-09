# Query — Reference

## Purpose

A **Query** iterates all entities that have **all required component types**, efficiently by scanning only the **matching archetypes (tables)**. 

---

## API

### `world.query(...ctors: ComponentCtor<any>[]): Iterable<any>`

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

### Row mapping and ordering

#### Deterministic component fields

The mapping is positional:

* `query(A)` → `{ e, c1 }`
* `query(A, B)` → `{ e, c1, c2 }`
* `query(A, B, C)` → `{ e, c1, c2, c3 }`

And `cN` always corresponds to the Nth constructor you passed. 

### Example

```ts
for (const { e, c1: pos, c2: vel } of world.query(Position, Velocity)) {
    pos.x += vel.x;
    pos.y += vel.y;

    // Safe structural change: defer it
    if (pos.x > 10) world.cmd().despawn(e);
}
```

This pattern is recommended explicitly for queries.

---

### `world.queryTables(...ctors: ComponentCtor<any>[]): Iterable<any>`

`ctors` is a list of component constructors (types) you want to require.

```typescript
for (const table of world.queryTables(Position, Velocity)) {
  // ...
}
```

Queries yield **one item per matching archetype (table)** (SoA columns + entity array):

* `entities`: `Entity[]` (row-aligned with all columns)
* `c1`, `c2`, `c3`, …: component **columns** (`T[]`) in the same order as `ctors`

So `queryTables(A, B, C)` yields `{ entities, c1: A[], c2: B[], c3: C[] }`.

#### Why `queryTables`?

Use this when you want fewer allocations and more cache-friendly loops:

* you iterate **columns + indices** instead of creating one `{e, c1, ...}` object per entity
* you can batch work per archetype

Example:
```typescript
for (const { entities, c1: pos, c2: vel } of world.queryTables(Position, Velocity)) {
  for (let i = 0; i < entities.length; i++) {
    pos[i]!.x += vel[i]!.dx;
    pos[i]!.y += vel[i]!.dy;
  }
}
```

---

### `world.queryEach(...ctorsAndFn): void`

Callback-based query: no generator, no yielded row objects.

```typescript
world.queryEach(Position, (e, pos) => {
  // ...
});

world.queryEach(Position, Velocity, (e, pos, vel) => {
  // ...
});
```

`queryEach(A, B, ...)` calls `fn(e, c1, c2, ...)` where `cN` matches the Nth constructor argument.

So `queryEach(A, B, C, fn)` calls `fn(e, A, B, C)` in that order.

#### Why `queryEach`?

Use this when you want the simplest “do work per entity” loop without generator overhead:
```typescript
world.queryEach(Position, Velocity, (e, pos, vel) => {
  pos.x += vel.dx;
  pos.y += vel.dy;

  // Safe structural change: defer it
  if (pos.x > 10) world.cmd().despawn(e);
});
```

---

## Safety rules during iteration

While iterating a query (or while systems are running), **structural changes** (spawn/despawn/add/remove) can throw.

Use:

* `world.cmd()` to defer changes
* `world.flush()` (or `world.update()`) to apply them safely 
