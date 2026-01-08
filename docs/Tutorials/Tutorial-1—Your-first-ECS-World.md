# Tutorial 1 — Your first ECS World

Outcome: you’ll run a tiny simulation loop where entities with `Position` + `Velocity` move over time, using `World`, `spawn`, `add`, `query`, `addSystem`, and `update(dt)`. 

---

## 1) What is an ECS? (one sentence)

ECS is a way to build simulations where **entities are IDs**, **components are data**, and **systems are functions that iterate entities with specific components**. 

---

## 2) Create a tiny project

```bash
mkdir ecs-tutorial-1
cd ecs-tutorial-1
npm init -y
npm i archetype-ecs-lib
npm i -D typescript tsx
```

Install is `npm i archetype-ecs-lib`. 

---

## 3) Create `tutorial1.ts`

Create a file named `tutorial1.ts` with this code:

```ts
import { World, WorldApi } from "archetype-ecs-lib";

// 1) Components = data (any class can be a component type)
class Position { constructor(public x = 0, public y = 0) {} }
class Velocity { constructor(public x = 0, public y = 0) {} }

// 2) Create a World (owns entities, components, systems)
const world = new World();

// 3) Spawn an entity and add components
const e = world.spawnMany(
  new Position(0, 0, 0),
  new Velocity(2, 0)// 2 units/sec along x
)

// 4) Add a system (runs each update)
world.addSystem((w, dt) => {
  for (const { e, c1: pos, c2: vel } of w.query(Position, Velocity)) {
    pos.x += vel.x * dt;
    pos.y += vel.y * dt;
  }
});

// 5) Run a small simulation loop (60 frames)
const dt = 1 / 60;

for (let frame = 1; frame <= 60; frame++) {
  world.update(dt);

  // Read back Position and print it
  const pos = world.get(e, Position)!;
  if (frame % 10 === 0) {
    console.log(`frame ${frame}: x=${pos.x.toFixed(2)} y=${pos.y.toFixed(2)}`);
  }
}
```

This uses the documented API:

* `spawn()`, `add(e, Ctor, value)`
* `addSystem(fn)`
* `query(Position, Velocity)` yielding `{ e, c1, c2 }`
* `update(dt)` to run systems each tick

---

## 4) Run it

```bash
npx tsx tutorial1.ts
```

You should see something like:

* `frame 10: x=0.33 ...`
* `frame 60: x=2.00 ...`

(Your exact decimals may differ slightly depending on rounding.)

---

## 5) You’ve built the core loop

You now have:

* a `World`
* entities created with `spawn()`
* components added with `add()`
* a system iterating `query(...)`
* a running simulation driven by `update(dt)` 
