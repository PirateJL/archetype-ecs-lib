# Tutorial 3 — Deferred structural changes

Outcome: you’ll learn the one rule that prevents most ECS bugs: **don’t change entity structure while iterating**. You’ll reproduce the problem safely, then fix it using **Commands** and **flush points** (via `Schedule`). The library explicitly supports this workflow: defer structural operations with `world.cmd()` and apply them with `world.flush()` / `Schedule` phase boundaries. 

---

## 1) Create `tutorial4.ts`

```ts
import { World, WorldApi, Schedule } from "archetype-ecs-lib";
```

---

## 2) Define simple components

```ts
class Position { constructor(public x = 0) {} }
class Velocity { constructor(public x = 0) {} }
```

---

## 3) Setup: spawn a few movers

```ts
const world = new World();

function spawnMover(x: number, vx: number) {
  const e = world.spawn();
  world.add(e, Position, new Position(x));
  world.add(e, Velocity, new Velocity(vx));
  return e;
}

spawnMover(0,  2);
spawnMover(5, -3);
spawnMover(9,  1);
```

This is standard structural usage: `spawn()` + `add()`. 

---

## 4) The unsafe thing (don’t do this)

Add this function:

```ts
const unsafeDespawnInsideQuery: SystemFn = (w: WorldApi) => {
  for (const { e, c1: pos } of w.query(Position)) {
    if (pos.x > 8) {
      // ❌ Structural change during iteration (may throw)
      w.despawn(e);
    }
  }
}
```

Now call it once (inside a try/catch so the tutorial keeps going):

```ts
try {
  unsafeDespawnInsideQuery(world);
  console.log("unsafe: no error (but still not safe)");
} catch (err: any) {
  console.log("unsafe: error as expected ->", String(err.message ?? err));
}
```

The lib will warn that structural changes during query iteration can throw and instructs to use `cmd()` + `flush()` instead. 

---

## 5) The safe fix: use Commands

Replace the unsafe function with a safe one:

```ts
const safeDespawnInsideQuery: SystemFn = (w: WorldApi) => {
  for (const { e, c1: pos } of w.query(RenderContextComponent)) {
    if (pos.x > 8) {
      // ✅ Defer structural change
      w.cmd().despawn(e);
    }
  }
}
```

Commands let you queue:

* `spawn`, `despawn`, `add`, `remove` 

---

## 6) Apply commands at a flush point

### Option A — Manual flush

```ts
safeDespawnInsideQuery(world);
world.flush(); // apply queued despawns
```

`flush()` applies queued commands (and `update()` also flushes automatically at the end). 

### Option B — Flush at phase boundaries (recommended)

Use `Schedule`, which flushes after each phase:

```ts
const sched = new Schedule();

sched.add(world, "sim", (w: WorldApi) => {
  // move
  for (const { c1: pos, c2: vel } of w.query(Position, Velocity)) {
    pos.x += vel.x;
  }
});

sched.add(world, "cleanup", (w: WorldApi) => {
  // safely despawn based on updated positions
  safeDespawnInsideQuery(w);
});

// Flush happens after each phase automatically
const phases = ["sim", "cleanup"];
```

`Schedule.run(world, dt, phases)` runs phases and calls `world.flush()` after each phase. 

---

## 7) Run a few ticks and print what’s left

Add a small logger:

```ts
function logPositions(w: WorldApi, label: string) {
  const items: string[] = [];
  for (const { e, c1: pos } of w.query(Position)) {
    items.push(`e${e.id}:${pos.x.toFixed(1)}`);
  }
  console.log(label, items.join(" | ") || "(none)");
}
```

Now run:

```ts
logPositions(world, "before");

for (let i = 0; i < 5; i++) {
  sched.run(world, 0, phases);
  logPositions(world, `after tick ${i + 1}`);
}
```

---

## 8) Full file (copy/paste)

```ts
import { World, Schedule } from "archetype-ecs-lib";

class Position { constructor(public x = 0) {} }
class Velocity { constructor(public x = 0) {} }

const world = new World();

function spawnMover(x: number, vx: number) {
  const e = world.spawn();
  world.add(e, Position, new Position(x));
  world.add(e, Velocity, new Velocity(vx));
  return e;
}

spawnMover(0,  2);
spawnMover(5, -3);
spawnMover(9,  1);

const unsafeDespawnInsideQuery: SystemFn = (w) => {
  for (const { e, c1: pos } of w.query(Position)) {
    if (pos.x > 8) {
      w.despawn(e); // ❌ may throw
    }
  }
}

try {
  unsafeDespawnInsideQuery(world as any);
  console.log("unsafe: no error (but still not safe)");
} catch (err: any) {
  console.log("unsafe: error as expected ->", String(err.message ?? err));
}

const safeDespawnInsideQuery: SystemFn = (w) => {
  for (const { e, c1: pos } of w.query(Position)) {
    if (pos.x > 8) w.cmd().despawn(e); // ✅ deferred
  }
}

function logPositions(w: WorldApi, label: string) {
  const items: string[] = [];
  for (const { e, c1: pos } of w.query(Position)) {
    items.push(`e${e.id}:${pos.x.toFixed(1)}`);
  }
  console.log(label, items.join(" | ") || "(none)");
}

const sched = new Schedule();

sched.add(world, "sim", (w: WorldApi) => {
  for (const { c1: pos, c2: vel } of w.query(Position, Velocity)) {
    pos.x += vel.x;
  }
});

sched.add(world, "cleanup", (w: WorldApi) => {
  safeDespawnInsideQuery(w);
});

const phases = ["sim", "cleanup"];

logPositions(world, "before");
for (let i = 0; i < 5; i++) {
  sched.run(world, 0, phases); // flush after each phase
  logPositions(world, `after tick ${i + 1}`);
}
```

---

## 9) Run it

```bash
npx tsx tutorial4.ts
```

You’ll see:

* the unsafe version may throw (depending on timing/guarding)
* the safe version consistently despawns entities after they cross the threshold
* phase flush points make the timing predictable 
