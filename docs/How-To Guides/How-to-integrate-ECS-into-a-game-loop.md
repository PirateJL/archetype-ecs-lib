# How to integrate ECS into a game loop

## Option A — Use `world.update(dt)`

1. Register systems with `addSystem(...)`
2. In your loop call:

```ts
function tick(dt: number) {
  world.update(dt); // runs systems, then flushes
}
```

## Option B — Use `Schedule` phases (recommended for games)

1. Build a schedule (`input`, `sim`, `render`)
2. In `requestAnimationFrame`:

```ts
let last = performance.now();

function frame(now: number) {
  const dt = (now - last) / 1000;
  last = now;

  sched.run(world, dt, ["input", "sim", "render"]); // flush between phases
  renderer.render(scene, camera);

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
```
