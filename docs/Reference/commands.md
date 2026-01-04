# Commands

## Purpose

`Commands` is a **deferred structural change buffer**. It lets you enqueue structural operations (spawn/despawn/add/remove) while iterating queries or running systems, then apply them later via `world.flush()` (or at the end of `world.update(dt)`). 

---

## How to obtain a `Commands` buffer

### `world.cmd(): Commands`

`World.cmd()` returns a `Commands` instance you can use to enqueue operations. 

Typical usage: 

```ts
const cmd = world.cmd();

cmd.spawn((e) => {
    cmd.add(e, Position, new Position(0, 0));
});

cmd.add(entity, Velocity, new Velocity(1, 0));
cmd.remove(entity, Velocity);
cmd.despawn(entity);

world.flush();
```

---

## Supported operations

The command buffer supports these operations (as documented by the project): 

### `spawn(init?)`

Enqueues creation of a new entity.

* `init?: (e: Entity) => void` is an optional callback invoked with the spawned entity, typically used to enqueue `add()` calls for initial components. 

---

### `despawn(e: Entity)`

Enqueues removal of an entity. 

---

### `add(e, ctor, value)`

Enqueues adding a component to an entity. This is a **structural** change (it may move the entity between archetypes), which is why it is commonly deferred. 

---

### `remove(e, ctor)`

Enqueues removing a component from an entity. This is also a **structural** change. 

---

## Applying commands

### `world.flush(): void`

Applies all queued commands. `World.update(dt)` also flushes automatically at the end of the frame. 

### With `Schedule`

When using `Schedule`, `world.flush()` is called **after each phase**, creating deterministic “phase barriers” for command application. 

---

## Safety rule

Direct structural operations can throw while iterating queries or running systems. The intended pattern is:

* enqueue structural changes with `world.cmd()`
* apply them with `world.flush()` (or let `update()` do it) 
