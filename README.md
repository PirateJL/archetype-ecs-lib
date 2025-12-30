![Coverage](./coverage.svg)

# Archetype ECS Lib

A tiny **archetype-based ECS** (Entity Component System) for TypeScript.

- **Archetypes (tables)** store entities in a **SoA** layout (one column per component type).
- **Queries** iterate matching archetypes efficiently.
- **Commands** let you **defer structural changes** (spawn/despawn/add/remove) safely.
- A minimal **Schedule** runs systems by phases and flushes commands between phases.

Exports are defined in `index.ts`:
- `Types`, `TypeRegistry`, `Commands`, `World`, `Schedule`

---

## Install

```bash
npm i archetype-ecs-lib
````

---

## Core concepts

### Entity

An entity is a lightweight handle:

```ts
type Entity = { id: number; gen: number };
```

The `gen` (generation) prevents using stale entity handles after despawn/reuse.

### Component

A component is any class used as a type key:

```ts
class Position { constructor(public x = 0, public y = 0) {} }
class Velocity { constructor(public x = 0, public y = 0) {} }
```

Internally, constructors are mapped to a stable numeric `TypeId` via `typeId()`.

### World

`World` owns entities, archetypes, commands, and systems.

Structural operations:

* `spawn()`, `despawn(e)`
* `add(e, Ctor, value)`, `remove(e, Ctor)`
* `has(e, Ctor)`, `get(e, Ctor)`, `set(e, Ctor, value)`
* `query(...ctors)` to iterate entities with required components
* `cmd()` to enqueue deferred commands
* `flush()` applies queued commands
* `update(dt)` runs registered systems and flushes at the end

### Deferred structural changes (important)

While iterating a query (or while systems are running), doing structural changes directly can throw:

> “Cannot do structural change (…) while iterating. Use world.cmd() and flush …”

Use `world.cmd()` inside systems / loops, and let `world.flush()` apply changes safely.

---

## Quick start

```ts
import { World, Schedule } from "archetype-ecs-lib";

class Position { constructor(public x = 0, public y = 0) {} }
class Velocity { constructor(public x = 0, public y = 0) {} }

const world = new World();

// Spawn immediately
const e = world.spawn();
world.add(e, Position, new Position(0, 0));
world.add(e, Velocity, new Velocity(1, 0));

// A simple system
world.addSystem((w: any, dt: number) => {
  for (const { e, c1: pos, c2: vel } of w.query(Position, Velocity)) {
    pos.x += vel.x * dt;
    pos.y += vel.y * dt;

    // Defer structural changes safely
    if (pos.x > 10) w.cmd().despawn(e);
  }
});

world.update(1 / 60);
```

> Note: `SystemFn` is typed as `(world: WorldI, dt) => void` where `WorldI` only requires `flush()`.
> In practice, you’ll typically use the concrete `World` API in systems (cast `world` or type your function accordingly).

---

## Query API

```ts
for (const row of world.query(Position, Velocity)) {
  // row.e  -> Entity
  // row.c1 -> Position
  // row.c2 -> Velocity
}
```

`query(...ctors)` yields objects shaped like:

* `e`: the entity
* `c1`, `c2`, `c3`, …: component values **in the same order** as the ctor arguments

So if you call `query(A, B, C)` you’ll get `{ e, c1: A, c2: B, c3: C }`.

---

## Commands API (deferred ops)

```ts
const cmd = world.cmd();

cmd.spawn((e) => {
  cmd.add(e, Position, new Position(0, 0));
});

cmd.add(entity, Velocity, new Velocity(1, 0));
cmd.remove(entity, Velocity);
cmd.despawn(entity);

// Apply them (World.update() also flushes automatically at end)
world.flush();
```

Supported commands (`Commands.ts`):

* `spawn(init?)`
* `despawn(e)`
* `add(e, ctor, value)`
* `remove(e, ctor)`

---

## Schedule (phases)

`Schedule` is a small phase runner:

```ts
import { World, Schedule } from "archetype-ecs-lib";

const world = new World();
const sched = new Schedule();

sched
  .add("input", (w: any) => { /* read input, enqueue commands */ })
  .add("sim",   (w: any, dt) => { /* update movement */ })
  .add("render",(w: any) => { /* build render data */ });

const phases = ["input", "sim", "render"];

// Runs each phase in order and calls world.flush() after each phase.
sched.run(world, 1/60, phases);
```

This is handy when you want deterministic ordering and command application points.

---

## World API summary

### Entity lifecycle

* `spawn(): Entity`
* `despawn(e: Entity): void`
* `isAlive(e: Entity): boolean`

### Components

* `has(e, Ctor): boolean`
* `get(e, Ctor): T | undefined`
* `set(e, Ctor, value): void` *(requires the component to exist; otherwise throws)*
* `add(e, Ctor, value): void` *(structural: may move entity between archetypes)*
* `remove(e, Ctor): void` *(structural: may move entity between archetypes)*

### Systems / frame

* `addSystem(fn): this`
* `update(dt): void` *(runs systems in order, then flushes)*
* `cmd(): Commands`
* `flush(): void`

### Queries

* `query(...ctors): Iterable<{ e: Entity; c1?: any; c2?: any; ... }>`

---

## Notes & limitations

* This is intentionally minimal: **no parallelism**, no borrow-checking, no automatic conflict detection.
* Query results use `c1/c2/...` fields for stability and speed; you can wrap this in helpers if you prefer tuple returns.
* `TypeId` assignment is process-local and based on constructor identity (`WeakMap`).

---

## License

```
MIT License

Copyright (c) 2025 Jean-Laurent Duzant

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
