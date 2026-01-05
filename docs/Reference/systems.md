# Systems

## Purpose

A **system** is a function executed by the ECS to update simulation state (usually by iterating queries and mutating component values). Systems are registered on the `World`, and executed during `world.update(dt)`. 

---

## System function type

### `SystemFn`

A system is a function with the signature:

* `(world: WorldI, dt: number) => void`

`WorldI` is the minimal interface required by systems; it includes `flush()` (the concrete `World` implements more). 

> In practice, examples call `query()` and `cmd()` inside systems, which are available on the concrete `World`. 

---

## Registering systems

### `world.addSystem(fn): this`

Adds a system to the world.

* Systems run in the **order they were added** (as described by “runs systems in order”). 

Example: 

```ts
world.addSystem((w: any, dt: number) => {
    for (const { e, c1: pos, c2: vel } of w.query(Position, Velocity)) {
        pos.x += vel.x * dt;
        pos.y += vel.y * dt;

        if (pos.x > 10) w.cmd().despawn(e);
    }
});
```

---

## Running systems (frame execution)

### `world.update(dt): void`

Runs one ECS frame:

1. Runs all registered systems (in order)
2. Flushes queued commands at the end 

The reference summary explicitly lists:

* `addSystem(fn): this`
* `update(dt): void` *(runs systems in order, then flushes)* 

---

## Structural changes inside systems

While systems are running (and while iterating queries), doing structural changes directly can throw. The recommended pattern is:

* enqueue structural changes with `world.cmd()`
* apply them with `world.flush()` (or let `update()` do it at the end) 

---

## Systems in phases (Schedule)

If you need explicit ordering across *groups* of systems, use `Schedule`:

* `sched.add(phase, systemFn)`
* `sched.run(world, dt, phases)` runs phases in order and calls `world.flush()` after each phase 

This provides deterministic “phase barriers” where deferred commands are applied. 
