![Coverage](https://raw.githubusercontent.com/PirateJL/archetype-ecs-lib/refs/heads/gh-pages/assets/coverage.svg)

# Archetype ECS Lib

A tiny **archetype-based ECS** (Entity Component System) for TypeScript.

- **Archetypes (tables)** store entities in a **SoA** layout (one column per component type).
- **Queries** iterate matching archetypes efficiently.
- **Commands** let you **defer structural changes** (spawn/despawn/add/remove) safely.
- A minimal **Schedule** runs systems by phases and flushes commands between phases.

Exports are defined in `index.ts`:
- `Types`, `TypeRegistry`, `Commands`, `World`, `Schedule`

> :exclamation: The full documentation is at [https://piratejl.github.io/archetype-ecs-lib/](https://piratejl.github.io/archetype-ecs-lib/)

---

## Install

```bash
npm i archetype-ecs-lib
```

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
world.addSystem((w) => {
  for (const { e, c1: pos, c2: vel } of w.query(Position, Velocity)) {
    pos.x += vel.x * dt;
    pos.y += vel.y * dt;

    // Defer structural changes safely
    if (pos.x > 10) w.cmd().despawn(e);
  }
});

world.update(1 / 60);
```

> Note: `SystemFn` is typed as `(world: WorldApi, dt) => void`..

---

## Notes & limitations

* This is intentionally minimal: **no parallelism**, no borrow-checking, no automatic conflict detection.
* Query results use `c1/c2/...` fields for stability and speed; you can wrap this in helpers if you prefer tuple returns.
* `TypeId` assignment is process-local and based on constructor identity (`WeakMap`).

---

## License

This code is distributed under the terms and conditions of the [MIT license](https://github.com/PirateJL/archetype-ecs-lib/blob/master/LICENSE).
