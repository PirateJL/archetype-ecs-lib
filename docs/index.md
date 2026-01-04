---
title: Home
hide:
  - navigation
  - toc
---

![Coverage](./assets/coverage.svg)

# Archetype ECS Lib

A tiny **archetype based ECS** (Entity Component System) for TypeScript.

This documentation is split into 4 parts :

* **[Explanation](./Explanation/ecs-and-the-game-loop.md)** of the general operation of the library
* Find information in the **[Reference](./Reference/archetypes.md)**
* Target a specific goal using the **[How-To Guides](./How-To%20Guides/How-to-add-remove-components-at-runtime.md)**
* Learn through the **[Tutorials](./Tutorials/Tutorial-1—Your-first-ECS-World.md)**: step-by-step guidance

---

## Install

> [NPM package available here](https://www.npmjs.com/package/archetype-ecs-lib)

```bash
npm i archetype-ecs-lib
```

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
> Checkout the [tutorials](./Tutorials/Tutorial-1—Your-first-ECS-World.md) for more!  

---

## Notes & limitations

* This is intentionally minimal: **no parallelism**, no borrow-checking, no automatic conflict detection.
* Query results use `c1/c2/...` fields for stability and speed; you can wrap this in helpers if you prefer tuple returns.
* `TypeId` assignment is process-local and based on constructor identity (`WeakMap`).

---

## License

This code is distributed under the terms and conditions of the [MIT license](https://github.com/PirateJL/archetype-ecs-lib/blob/master/LICENSE).
