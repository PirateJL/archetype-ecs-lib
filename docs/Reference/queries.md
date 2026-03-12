# Query — Reference

## Purpose

A **Query** iterates all entities that have **all required component types**, efficiently by scanning only the **matching archetypes (tables)**.

An optional **`QueryFilter`** can be appended to any query to refine which archetypes are visited:

- `with` — require additional component types to be present **without** returning their values
- `without` — exclude archetypes that have **any** of the listed component types

---

## QueryFilter

```ts
type QueryFilter = {
    readonly with?:    ReadonlyArray<ComponentCtor<any>>;
    readonly without?: ReadonlyArray<ComponentCtor<any>>;
};
```

Pass it as the **last argument** before the callback (for `queryEach`) or as the last argument overall (for `query` / `queryTables`):

```ts
// require Active, exclude Frozen — neither value is returned
world.query(Position, Velocity, { with: [Active], without: [Frozen] })

// exclude Dead without returning any extra component
world.queryEach(Position, { without: [Dead] }, (e, pos) => { ... })
```

Both fields are optional; omit the filter entirely when no filtering is needed.

---

## API

### `world.query(...ctors: ComponentCtor<any>[], filter?: QueryFilter): Iterable<any>`

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

`cN` always corresponds to the Nth constructor you passed. Components listed inside a `QueryFilter` do **not** count toward `cN` indices and are not returned in the row.

### Examples

Basic query:

```ts
for (const { e, c1: pos, c2: vel } of world.query(Position, Velocity)) {
    pos.x += vel.x;
    pos.y += vel.y;

    // Safe structural change: defer it
    if (pos.x > 10) world.cmd().despawn(e);
}
```

With a filter — require `Active`, exclude `Frozen`:

```ts
for (const { c1: pos, c2: vel } of world.query(Position, Velocity, { with: [Active], without: [Frozen] })) {
    pos.x += vel.x;
    pos.y += vel.y;
}
```

The row shape is still `{ e, c1: Position, c2: Velocity }` — the filter components are invisible in the result.

---

### `world.queryTables(...ctors: ComponentCtor<any>[], filter?: QueryFilter): Iterable<any>`

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

Examples:

```typescript
for (const { entities, c1: pos, c2: vel } of world.queryTables(Position, Velocity)) {
  for (let i = 0; i < entities.length; i++) {
    pos[i]!.x += vel[i]!.dx;
    pos[i]!.y += vel[i]!.dy;
  }
}
```

With a filter:

```typescript
for (const { entities, c1: pos } of world.queryTables(Position, { without: [Frozen] })) {
  for (let i = 0; i < entities.length; i++) {
    pos[i]!.x += 1;
  }
}
```

---

### `world.queryEach(...ctors, filter?: QueryFilter, fn): void`

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

So `queryEach(A, B, C, fn)` calls `fn(e, A_value, B_value, C_value)` in that order.

#### With a filter

Place the `QueryFilter` **between the last component constructor and the callback**:

```typescript
// Exclude Frozen — callback receives only Position and Velocity
world.queryEach(Position, Velocity, { without: [Frozen] }, (e, pos, vel) => {
  pos.x += vel.dx;
  pos.y += vel.dy;
});

// Require Active marker — callback still receives only Position
world.queryEach(Position, { with: [Active] }, (e, pos) => {
  pos.x += 1;
});
```

Components inside the filter are **not** added as callback parameters.

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
