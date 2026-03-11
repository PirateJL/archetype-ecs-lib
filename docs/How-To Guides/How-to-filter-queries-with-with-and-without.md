# How to filter queries with `with` and `without`

`QueryFilter` lets you narrow any query beyond the components you ask for by value.

```ts
type QueryFilter = {
    readonly with?:    ReadonlyArray<ComponentCtor<any>>;
    readonly without?: ReadonlyArray<ComponentCtor<any>>;
};
```

Pass it as the **last argument** (or just before the callback for `queryEach`).

---

## Exclude entities that have a component — `without`

### Problem

You want to move every entity that has `Position` and `Velocity`, but not those that are frozen.

### Solution

Add a `without: [FrozenTag]` filter. Archetypes that include `FrozenTag` are skipped entirely.

```ts
class FrozenTag {}

world.queryEach(Position, Velocity, { without: [FrozenTag] }, (e, pos, vel) => {
    pos.x += vel.x * dt;
    pos.y += vel.y * dt;
});
```

Entities that also carry `FrozenTag` are invisible to this query — no per-entity branch needed.

---

## Require a marker without returning its value — `with`

### Problem

You want to query only the player entity (tagged `PlayerTag`) but you don't need the tag value in your callback.

### Solution

Use `with: [PlayerTag]`. The archetype must include `PlayerTag`, but the tag is not returned.

```ts
class PlayerTag {}

// query — row is { e, c1: Position, c2: Circle }, no c3 for PlayerTag
for (const { c1: pos, c2: circle } of world.query(Position, Circle, { with: [PlayerTag] })) {
    // ...
}

// queryEach — callback receives (e, pos, circle), no PlayerTag argument
world.queryEach(Position, Circle, { with: [PlayerTag] }, (e, pos, circle) => {
    // clamp player to viewport ...
});
```

This is cleaner than listing `PlayerTag` as a positional argument when you don't use it.

---

## Combine `with` and `without`

Both fields can be used together:

```ts
// Entities that are Active and not Stunned
world.queryEach(Position, Velocity, { with: [Active], without: [Stunned] }, (e, pos, vel) => {
    pos.x += vel.x * dt;
    pos.y += vel.y * dt;
});
```

---

## Apply a filter to `queryTables`

`queryTables` accepts the same filter as the last argument:

```ts
// Render active items (full colour)
for (const table of world.queryTables(Position, Circle, ItemKind, { without: [FrozenTag] })) {
    for (let i = 0; i < table.entities.length; i++) {
        draw(table.c1[i]!, table.c2[i]!, "full");
    }
}

// Render frozen items (faded)
for (const table of world.queryTables(Position, Circle, ItemKind, { with: [FrozenTag] })) {
    for (let i = 0; i < table.entities.length; i++) {
        draw(table.c1[i]!, table.c2[i]!, "faded");
    }
}
```

---

## Freeze entities on a state transition

A common pattern: on game-over, mark all active falling items as frozen so movement systems skip them automatically.

```ts
// In a resolve system — called once when lives reach 0
if (game.lives === 0) {
    game.running = false;

    // `without: [FrozenTag]` prevents double-adding if this fires more than once
    for (const { e } of world.query(FallingKindToken, { without: [FrozenTag] })) {
        world.cmd().add(e, FrozenTag, new FrozenTag());
    }
}

// In the movement system — frozen items are silently skipped
world.queryEach(Position, Velocity, { without: [FrozenTag] }, (e, pos, vel) => {
    pos.x += vel.x * dt;
    pos.y += vel.y * dt;
});
```

This removes the need for any `if (game.running)` guard inside movement loops.

---

## What `QueryFilter` does NOT do

- It does **not** return extra components — `with` is purely a filter, not a projection.
- It does **not** affect the `cN` numbering of returned components. Only positional constructor arguments count.
- It is checked at the **archetype level** — the filter is applied once per matching table, not once per entity, so there is no per-entity overhead.
