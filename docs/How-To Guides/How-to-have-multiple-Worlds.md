# How to have multiple Worlds (globe vs ground simulation)

1. Create two worlds:

```ts
const globeWorld = new World();
const groundWorld = new World();
```

2. Give each one its own schedule (recommended):

```ts
const globeSched  = new Schedule();
const groundSched = new Schedule();
```

3. Run both each frame (same `dt`):

```ts
globeSched.run(globeWorld, dt, ["input", "sim", "render"]);
groundSched.run(groundWorld, dt, ["input", "sim", "render"]);
```

4. Share data **explicitly** between worlds (pick one):

* copy values at a known point (end of `sim`, start of other `sim`)
* or have a “bridge” step in your outer loop that reads from one world and writes into the other (via normal `add/set` or via `cmd()` + `flush()`)
