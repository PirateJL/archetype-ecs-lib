# Tutorial 4 — Writing systems

Outcome: you’ll write real gameplay logic as **systems**: query components, mutate data safely, and run everything through a **Schedule** (`input → sim → cleanup`) with automatic `flush()` between phases. 

---

## 1) Create `tutorial3.ts`

```ts
import { World, WorldApi, Schedule, SystemFn } from "archetype-ecs-lib";
```

The lib exports `World` and `Schedule`. 

---

## 2) Define components (data only)

```ts
class Position { constructor(public x = 0, public y = 0) {} }
class Velocity { constructor(public x = 0, public y = 0) {} }
class Lifetime { constructor(public seconds = 1.0) {} } // despawn when <= 0
```

---

## 3) Create a World and spawn a few entities

```ts
const world = new World();

function spawnMover(x: number, y: number, vx: number, vy: number, life = 2.0) {
  const e = world.spawn();
  world.add(e, Position, new Position(x, y));
  world.add(e, Velocity, new Velocity(vx, vy));
  world.add(e, Lifetime, new Lifetime(life));
  return e;
}

spawnMover(0, 0,  2, 0, 1.2);
spawnMover(0, 1,  1, 0, 2.5);
spawnMover(0, 2, -1, 0, 0.8);
```

This uses the documented structural ops: `spawn()` and `add()`. 

---

## 4) System function signature (what you write)

A system is a function called like:

* `(world, dt) => void`

Systems are added using `world.addSystem()` like `world.addSystem((w: WorldApi, dt: number) => ...)`. 

In this tutorial we’ll register systems on a `Schedule` (phases), but the function shape is the same.

---

## 5) Write your first real system: movement

This system queries `Position + Velocity` and updates positions.

```ts
const movementSystem: SystemFn = (w: WorldApi, dt: number) => {
  for (const { c1: pos, c2: vel } of w.query(Position, Velocity)) {
    pos.x += vel.x * dt;
    pos.y += vel.y * dt;
  }
}
```

Query rows provide `{ e, c1, c2, ... }` in the same order as the query arguments. 

---

## 6) Mutating data safely: despawn using commands

Despawning is a **structural change**, so do it through `cmd()` inside systems.

```ts
const lifetimeSystem: SystemFn = (w: WorldApi, dt: number) => {
  for (const { e, c1: life } of w.query(Lifetime)) {
    life.seconds -= dt;
    if (life.seconds <= 0) {
      w.cmd().despawn(e); // safe: deferred
    }
  }
}
```

---

## 7) Add a small “cleanup / log” system

We’ll print positions so you can see it running. This does not do structural changes.

```ts
const logSystem: SystemFn = (w: WorldApi, dt: number) => {
  const lines: string[] = [];
  for (const { e, c1: pos } of w.query(Position)) {
    lines.push(`e${e.id} @ (${pos.x.toFixed(2)}, ${pos.y.toFixed(2)})`);
  }
  console.log(`frame ${frame}: ${lines.join(" | ")}`);
}
```

---

## 8) Run systems via Schedule (phases)

1. Create a schedule
2. Register systems under phases
3. Run phases each tick

```ts
const sched = new Schedule();

sched.add("sim", movementSystem);
sched.add("sim", lifetimeSystem);

// log in a separate phase so structural changes are already flushed
let frameNo = 0;
sched.add("cleanup", (w: WorldApi) => {
  frameNo++;
  logSystem(w, frameNo);
});

const phases = ["sim", "cleanup"];
```

`Schedule.run(world, dt, phases)` runs phases in order and calls `world.flush()` after each phase. 

---

## 9) Run the loop

```ts
const dt = 1 / 10; // bigger dt so it’s easy to see
for (let i = 0; i < 20; i++) {
  sched.run(world, dt, phases);
}
```

---

## 10) Full file (copy/paste)

```ts
import { World, WorldApi Schedule, SystemFn } from "archetype-ecs-lib";

class Position { constructor(public x = 0, public y = 0) {} }
class Velocity { constructor(public x = 0, public y = 0) {} }
class Lifetime { constructor(public seconds = 1.0) {} }

const world = new World();

function spawnMover(x: number, y: number, vx: number, vy: number, life = 2.0) {
  const e = world.spawn();
  world.add(e, Position, new Position(x, y));
  world.add(e, Velocity, new Velocity(vx, vy));
  world.add(e, Lifetime, new Lifetime(life));
  return e;
}

spawnMover(0, 0,  2, 0, 1.2);
spawnMover(0, 1,  1, 0, 2.5);
spawnMover(0, 2, -1, 0, 0.8);

const movementSystem: SystemFn = (w: WorldApi, dt: number) => {
  for (const { c1: pos, c2: vel } of w.query(Position, Velocity)) {
    pos.x += vel.x * dt;
    pos.y += vel.y * dt;
  }
}

const lifetimeSystem: SystemFn = (w: WorldApi, dt: number) => {
  for (const { e, c1: life } of w.query(Lifetime)) {
    life.seconds -= dt;
    if (life.seconds <= 0) w.cmd().despawn(e);
  }
}

const logSystem: SystemFn = (w: WorldApi, dt: number) => {
  const lines: string[] = [];
  for (const { e, c1: pos } of w.query(Position)) {
    lines.push(`e${e.id} @ (${pos.x.toFixed(2)}, ${pos.y.toFixed(2)})`);
  }
  console.log(`frame ${frame}: ${lines.join(" | ")}`);
}

const sched = new Schedule();
sched.add("sim", movementSystem);
sched.add("sim", lifetimeSystem);

let frameNo = 0;
sched.add("cleanup", (w: WorldApi) => {
  frameNo++;
  logSystem(w, frameNo);
});

const phases = ["sim", "cleanup"];

const dt = 1 / 10;
for (let i = 0; i < 20; i++) {
  sched.run(world, dt, phases);
}
```

---

## 11) Run it

```bash
npx tsx tutorial3.ts
```

You’ll see entities moving, then disappearing as their `Lifetime` reaches 0 (despawned safely via commands + phase flush). 
