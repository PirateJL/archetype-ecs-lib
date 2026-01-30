# Schedule

## Purpose

`Schedule` is a **multiphase runner**.

It groups system functions under **named phases** (e.g. `"input"`, `"update"`, `"render"`), then executes those phases in a chosen order. At **phase boundaries**, it can automatically:

- flush deferred structural commands (`world.flush()`, only if commands are pending)
- deliver events to the next phase (`world.swapEvents()`)

This lets you build a deterministic pipeline (input → simulation → rendering → audio, etc.) without running into "structural change during iteration" problems.

---

## Construction

```
ts
const schedule = new Schedule();
```

A `Schedule` is independent from `World`, you pass the `world` at run time.

---

## Adding systems to phases

### `add(world: WorldApi, phase: string, fn: SystemFn): { after, before }`

Registers `fn` under `phase` for the given `world`.

- You can register multiple systems under the same phase (they run in insertion order).
- Returns an object with `after()` and `before()` methods for chaining phase constraints.

Example:
```
ts
schedule
    .add(world, "input", inputSystem)
    .add(world, "update", updateSystem)
    .add(world, "render", renderSystem);
```
---

## Phase ordering constraints

Constraints are **phase-level** (not system-level): they affect the relative order of phases, not the order of systems within a phase.

### `after(otherPhase: string): this`

Constrain the **most recently added phase** to run after `otherPhase`.

```
ts
schedule.add(world, "sim", simSystem).after("input"); // input -> sim
```

You can chain multiple constraints:
```
ts
schedule.add(world, "sim", simSystem).after("beginFrame").after("input");
```

> `after()` must be called after `add(...)`. Calling it before any `add(...)` throws an error.

### `before(otherPhase: string): this`

Constrain the **most recently added phase** to run before `otherPhase`.

```
ts
schedule.add(world, "input", inputSystem).before("sim"); // input -> sim
```

> `before()` must be called after `add(...)`. Calling it before any `add(...)` throws an error.

---

## Selecting a phase order

`Schedule.run()` chooses a phase order using the following precedence:

1. If `run(..., phaseOrder)` is provided, it is used as-is.
2. Else, if `setOrder([...])` was called, the stored order is used.
3. Else, an order is computed from `.after()`/`.before()` constraints (stable topological sort).

### `setOrder(phases: string[]): this`

Set a default phase order used by `run(world, dt)` when no `phaseOrder` is passed.

```
ts
schedule.setOrder(["input", "sim", "render"]);
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
```

ts
schedule.setBoundaryMode("auto"); // default
schedule.setBoundaryMode("manual"); // advanced usage
```

---

## Running phases

### `run(world: WorldApi, dt: number, phaseOrder?: string[]): void`

Runs the schedule for a single tick:

- Executes phases in the chosen order.
- Executes all systems registered under each phase.
- Applies phase boundary behavior according to `setBoundaryMode()`.

Example (explicit order):
```
ts
schedule.run(world, 1/60, ["input", "sim", "render"]);
```

Example (computed order from constraints):
```
ts
schedule
    .add(world, "input", inputSystem)
    .add(world, "sim", simSystem).after("input")
    .add(world, "render", renderSystem).after("sim");

schedule.run(world, 1 / 60);
```

---

## Errors and lifecycle notes

- **System errors**: If a system throws, `Schedule` rethrows a wrapped error with context:
    - `"[phase=<phase> system=<name>] <message>"`
- **Cyclic constraints**: If constraints contain a cycle and no explicit order is provided, `run()` throws.
- **No phase order**: If no phase order can be determined (no explicit order, no stored order, and nothing scheduled), `run()` throws:
    - `Schedule.run requires a phase order (pass it as an argument or call schedule.setOrder([...]))`

### Lifecycle conflict detection

`Schedule.run()` and `World.update()` are **mutually exclusive** on the same `World` instance:

- If you register systems via `world.addSystem()` and then call `schedule.run()`, an error is thrown.
- If you register systems via `schedule.add()` and then call `world.update()`, an error is thrown.

This prevents confusing behavior from mixing two different system execution models in the same world.

**Choose ONE approach:**

| Approach              | Register systems with            | Run with                          |
|-----------------------|----------------------------------|-----------------------------------|
| Simple (single-phase) | `world.addSystem(fn)`            | `world.update(dt)`                |
| Multi-phase           | `schedule.add(world, phase, fn)` | `schedule.run(world, dt, phases)` |

---

## Relationship to `World.update(dt)`

| Feature             | `World.update(dt)`             | `Schedule.run(world, dt, phases)`          |
|---------------------|--------------------------------|--------------------------------------------|
| System registration | `world.addSystem(fn)`          | `schedule.add(world, phase, fn)`           |
| Phase support       | Single implicit phase          | Multiple named phases                      |
| Phase ordering      | N/A                            | Via `after()`/`before()` or explicit order |
| Command flush       | Once at end                    | After each phase (if pending)              |
| Event swap          | Once at end                    | After each phase                           |
| Best for            | Simple game loops, prototyping | Complex pipelines, deterministic ordering  |

