# How to run logic conditionally

## Option A — Guard inside the system (simple)

1. Put a condition at the top:

```ts
let paused = false;

world.addSystem((w: any, dt: number) => {
  if (paused) return;
  for (const { c1: pos, c2: vel } of w.query(Position, Velocity)) {
    pos.x += vel.x * dt;
  }
});
```

## Option B — Conditional phases (skip whole groups)

1. Maintain your phase list dynamically:

```ts
const base = ["input", "sim", "render"];

function getPhases(paused: boolean) {
  return paused ? ["input", "render"] : base;
}

sched.run(world, dt, getPhases(paused));
```

## Option C — Wrap systems (reuse predicates)

1. Make a helper:

```ts
const runIf = (pred: () => boolean, fn: (w: any, dt: number) => void) =>
  (w: any, dt: number) => { if (pred()) fn(w, dt); };

world.addSystem(runIf(() => !paused, (w, dt) => {
  for (const { c1: pos, c2: vel } of w.query(Position, Velocity)) {
    pos.x += vel.x * dt;
  }
}));
```
