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

### `spawnWith(...items: ComponentCtorBundleItem[])`

Queues the creation of a new entity, along with its initial components, and applies everything on the next flush (within the same flush cycle).

* `...items: ComponentCtorBundleItem[]` is the list of components to add to the newly created entity.
* Internally, it iterates over the items and calls `add(e, ctor, value)` for each component.

```ts
world.cmd().spawnWith(
    [Position, new Position(0, 0)],
    [Velocity, new Velocity(1, 0)],
);
```

---

### `despawn(e: Entity)`

Enqueues removal of an entity.

---

### `despawnMany(entities: Entity[])`

Enqueues the destruction of multiple entities. The actual removals are applied when commands are flushed.

* `entities: Entity[]` is the list of entities to despawn.
* Internally, it iterates over the array and calls `despawn(e)` for each entity.

---

### `add(e, ctor, value)`

Enqueues adding a component to an entity. This is a **structural** change (it may move the entity between archetypes), which is why it is commonly deferred.

---

### `addMany(e: Entity, ...items: ComponentCtorBundleItem[])`

Enqueues adding multiple components to an existing entity as a **single batched command**. On flush, all components are applied in one archetype migration instead of one per component.

* `e: Entity` is the target entity.
* `...items: ComponentCtorBundleItem[]` is the list of components to add.
* No-op if `items` is empty.

---

### `remove(e, ctor)`

Enqueues removing a component from an entity. This is also a **structural** change.

---

### `removeMany(e: Entity, ...ctors: ComponentCtor<any>[])`

Enqueues removal of multiple component types from an entity as a **single batched command**. On flush, all components are removed in one archetype migration instead of one per component.

* `e: Entity` is the target entity.
* `...ctors: ComponentCtor<any>[]` is the list of component constructors (types) to remove.
* No-op if `ctors` is empty.

---

## Reusable bundles

Use the `bundle()` helper to define a named, reusable group of components:

```ts
import { bundle } from "archetype-ecs-lib";

const PhysicsBundle = bundle(
    [Position, new Position(0, 0)],
    [Velocity, new Velocity(0, 0)],
);

// Spread into cmd or direct world calls
world.cmd().spawnWith(...PhysicsBundle);
world.spawnWith(...PhysicsBundle);
world.cmd().addMany(e, ...PhysicsBundle);
```

`bundle()` simply returns a typed `readonly ComponentCtorBundleItem[]`, avoiding the need for `as const` casts.

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
