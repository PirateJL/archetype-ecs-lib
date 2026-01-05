# Schedule

## Purpose

`Schedule` is a **phase runner**: it groups systems under named phases, then runs those phases in a chosen order, calling `world.flush()` **between phases** to apply deferred structural commands deterministically. 

---

## Construction

```ts
const sched = new Schedule();
```

`Schedule` is independent from `World`; you pass the `World` (or compatible object) at run time. 

---

## Adding systems to phases

### `add(phase: string, fn: SystemFn): this`

Registers a system function under a phase name.

* You can register multiple systems under the same phase. 

Example:

```ts
sched
  .add("input",  (w: any) => { /* ... */ })
  .add("sim",    (w: any, dt) => { /* ... */ })
  .add("render", (w: any) => { /* ... */ });
```

---

## Running phases

### `run(world: WorldLike, dt: number, phases: string[]): void`

Runs the schedule for a single tick:

* Executes phases **in the exact order** provided by `phases`.
* Calls `world.flush()` **after each phase** (phase barrier). 

Example:

```ts
const phases = ["input", "sim", "render"];
sched.run(world, 1/60, phases);
```

---

## Flush semantics

`Schedule` relies on `world.flush()` to apply deferred structural changes queued via commands, enabling safe structural edits while systems and queries run. 

---

## Relationship to `World.update(dt)`

* `world.update(dt)` runs the world’s own registered systems and flushes at the end. 
* `Schedule` is used when you want **explicit phase ordering** and **flush points between groups of systems** rather than only at frame end. 
