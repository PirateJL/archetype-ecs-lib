# Schedule

## Purpose

`Schedule` is a **multiphase runner**.

It groups system functions under **named phases** (e.g. `"input"`, `"update"`, `"render"`), then executes those phases in a chosen order. At **phase boundaries**, it can automatically:

- flush deferred structural commands (`world.flush()`, only if commands are pending)
- deliver events to the next phase (`world.swapEvents()`)

This lets you build a deterministic pipeline (input → simulation → rendering → audio, etc.) without running into “structural change during iteration” problems.

---

## Construction

```ts
const sched = new Schedule();
```

A `Schedule` is independent from `World`; you pass the `world` at run time.

---

## Adding systems to phases

### `add(phase: string, fn: SystemFn): this`

Registers `fn` under `phase`.

- You can register multiple systems under the same phase (they run in insertion order).
- Returns `this` for fluent chaining (retro-compatible).

Example:

```ts
sched
    .add("input", inputSystem)
    .add("update", updateSystem)
    .add("render", renderSystem);
```

---

## Phase ordering constraints

Constraints are **phase-level** (not system-level): they affect the relative order of phases, not the order of systems within a phase.

### `after(otherPhase: string): this`

Constrain the **most recently added phase** to run after `otherPhase`.

```ts
sched.add("sim", simSystem).after("input"); // input -> sim
```

You can call it multiple times to add multiple constraints:

```ts
sched.add("sim", simSystem).after("beginFrame").after("input");
```

> `after()` must be called after `add(...)`. Calling it before any `add(...)` throws an error.

### `before(otherPhase: string): this`

Constrain the **most recently added phase** to run before `otherPhase`.

```ts
sched.add("input", inputSystem).before("sim"); // input -> sim
```

> `before()` must be called after `add(...)`. Calling it before any `add(...)` throws.

---

## Selecting a phase order

`Schedule.run()` chooses a phase order using the following precedence:

1. If `run(..., phaseOrder)` is provided, it is used as-is.
2. Else, if `setOrder([...])` was called, the stored order is used.
3. Else, an order is computed from `.after()`/`.before()` constraints (stable topological sort).

### `setOrder(phases: string[]): this`

Set a default phase order used by `run(world, dt)` when no `phaseOrder` is passed.

```ts
sched.setOrder(["input", "sim", "render"]);
```

---

## Phase boundary behavior

### `setBoundaryMode(mode: "auto" | "manual"): this`

Controls what happens after each phase:

- `"auto"` (default):
    - if `world.cmd().hasPending()` → `world.flush()`
    - always `world.swapEvents()`
- `"manual"`:
    - do nothing automatically; the caller is responsible for `world.flush()` / `world.swapEvents()`

```ts
sched.setBoundaryMode("auto"); // default
sched.setBoundaryMode("manual"); // advanced usage
```

---

## Running phases

### `run(world: WorldApi, dt: number, phaseOrder?: string[]): void`

Runs the schedule for a single tick:

- Executes phases in the chosen order.
- Executes all systems registered under each phase.
- Applies phase boundary behavior according to `setBoundaryMode()`.

Example (explicit order):

```ts
sched.run(world, 1/60, ["input", "sim", "render"]);
```

Example (computed order from constraints):

```ts
sched
    .add("input", inputSystem)
    .add("sim", simSystem).after("input")
    .add("render", renderSystem).after("sim");
sched.run(world, 1 / 60);
```

---

## Errors and lifecycle notes

- If a system throws, `Schedule` rethrows a wrapped error:
    - `"[phase=<phase> system=<name>] <message>"`
- If constraints contain a cycle and no explicit order is provided, `run()` throws.
- If no phase order can be determined (no explicit order, no stored order, and nothing scheduled), `run()` throws:
    - `Schedule.run requires a phase order (pass it as an argument or call schedule.setOrder([...]))`
- `Schedule.run()` and `World.update()` are mutually exclusive on the same `World` instance (runtime error if both are used).

---

## Relationship to `World.update(dt)`

- `world.update(dt)` runs the world’s own registered systems and flushes at the end.
- `Schedule` is for explicit **phase ordering** and **phase boundaries** (flush / event delivery between groups of systems).
