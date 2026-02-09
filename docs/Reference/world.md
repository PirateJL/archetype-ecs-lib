# World

## Purpose

`World` is the **central authority** of the ECS.
It owns and coordinates:

* entity lifecycle
* archetypes and component storage
* queries
* deferred structural commands
* system execution

There is **exactly one `World` instance per ECS context**.

---

## Construction

```ts
const world = new World();
```

### Side effects

* Initializes an empty entity pool
* Initializes archetype storage
* Initializes command buffer
* Initializes system list

---

## Entity Lifecycle API

### `spawn(): Entity`

Creates a new entity immediately.

* Allocates a new entity id
* Marks entity as alive
* Places entity in the empty archetype

```ts
const e = world.spawn();
```

---

### `spawnMany(...items: ComponentCtorBundleItem[]): Entity`

Creates a new entity along with its initial components immediately.

* `...items: ComponentCtorBundleItem[]` is the list of components to add to the newly created entity.
* Internally, it iterates over the items and calls `add` for each component.

---

### `despawn(e: Entity): void`

Immediately removes an entity.

* Invalidates the entity handle (`gen` mismatch)
* Removes the entity from its archetype
* Frees the slot for reuse

Throws if:

* entity is stale or not alive

---

### `despawnMany(entities: Entity[]): void`

Immediately removes multiple entities.

* `entities: Entity[]` is the list of entities to despawn.
* Internally, it iterates over the array and calls `despawn(e)` for each entity.

---

### `isAlive(e: Entity): boolean`

Checks whether an entity handle is still valid.

```ts
if (world.isAlive(e)) { ... }
```

---

## Component API

All component types are identified by **constructor identity**.

### `has<T>(e: Entity, ctor: ComponentCtor<T>): boolean`

Checks if an entity has a component.

---

### `get<T>(e: Entity, ctor: ComponentCtor<T>): T | undefined`

Returns the component value or `undefined`.

* Does **not** throw if missing
* Returns `undefined` for stale entities

---

### `add<T>(e: Entity, ctor: ComponentCtor<T>, value: T): void`

Adds a component to an entity.

* **Structural change**
* Moves the entity to a different archetype

Throws if:

* entity is stale
* component already exists
* structural changes are forbidden (see iteration rules)

---

### `addMany(e: Entity, ...items: ComponentCtorBundleItem[]): void`

Adding multiple components to an existing entity.

* `e: Entity` is the target entity.
* `...items: ComponentCtorBundleItem[]` is the list of components to add.
* Internally, it loops through the items and calls `add` for each component.

---

### `remove<T>(e: Entity, ctor: ComponentCtor<T>): void`

Removes a component.

* **Structural change**
* Moves the entity to a different archetype

Throws if:

* entity is stale
* component does not exist
* structural changes are forbidden

---

### `removeMany(e: Entity, ...ctors: ComponentCtor<any>[]): void`

Removes multiple component types from an entity.

* `e: Entity` is the target entity.
* `...ctors: ComponentCtor<any>[]` is the list of component constructors (types) to remove.
* Internally, it loops through the ctors and calls `remove` for each one.

---

### `set<T>(e: Entity, ctor: ComponentCtor<T>, value: T): void`

Updates an existing component value.

* **Non-structural**
* Does not change archetypes

Throws if:

* entity is stale
* component does not exist

---

## Query API

### `query(...ctors): Iterable<QueryRow>`

Iterates entities that contain **all requested components**.

```ts
for (const { e, c1, c2 } of world.query(A, B)) {
    // e  -> Entity
    // c1 -> A
    // c2 -> B
}
```

#### Properties

* Iterates archetypes, not entities
* Components are returned as `c1`, `c2`, … in **argument order**
* Query iteration **locks structural changes**

---

## Structural Change Rules

While iterating a query or running systems:

* ❌ `spawn`, `despawn`, `add`, `remove` are forbidden
* ✔️ `get`, `set`, `has` are allowed

Violations throw a runtime error.

---

## Command Buffer API

### `cmd(): Commands`

Returns a command buffer for **deferred structural changes**.

```ts
world.cmd().despawn(e);
```

Commands are **queued**, not applied immediately.

---

### `flush(): void`

Applies all queued commands.

* Safe to call after queries
* Automatically called by `update()` and `Schedule`

---

## Snapshot / Restore API

### `registerComponentSnapshot<T, D>(key: ComponentCtor<T>, codec: SnapshotCodec<T, D>): this`

Registers a component serializer/deserializer for snapshots.

---

### `unregisterComponentSnapshot<T>(key: ComponentCtor<T>): boolean`

Removes a component snapshot registration.

---

### `registerResourceSnapshot<T, D>(key: ComponentCtor<T>, codec: SnapshotCodec<T, D>): this`

Registers a resource serializer/deserializer for snapshots.

---

### `unregisterResourceSnapshot<T>(key: ComponentCtor<T>): boolean`

Removes a resource snapshot registration.

---

### `snapshot(): WorldSnapshot`

Exports world data state (entities + registered components/resources + allocator).

---

### `restore(snapshot: WorldSnapshot): void`

Loads snapshot data into the world.

Runtime behavior (systems/schedule/events/queued commands) is not persisted.

---

## System API

### `addSystem(fn: SystemFn): this`

Registers a system.

```ts
world.addSystem((w, dt) => { ... });
```

Systems are executed **in insertion order**.

---

### `update(dt: number): void`

Runs one ECS frame.

Execution order:

1. Run all systems
2. Flush deferred commands

```ts
world.update(1 / 60);
```

---

## Events API

### `emit<T>(key: ComponentCtor<T>, ev: T): void`

Emits an event of type `T` into the current phase write buffer.

---

### `events<T>(key: ComponentCtor<T>): EventChannel<T>`

Returns the event channel for `key`, creating it if missing.

---

### `drainEvents<T>(key: ComponentCtor<T>, fn: (ev: T) => void): void`

Drains readable events for the given type.

**Behavior**

* If the channel doesn’t exist yet, it’s a **no-op** (does not allocate/create)

---

### `clearEvents<T>(key?: ComponentCtor<T>): void`

Clears readable events.

* If `key` is provided: clears that event type’s **read buffer**
* If omitted: clears the **read buffers of all** event types

---

### `swapEvents(): void` (internal / schedule boundary)

Swaps all event channels’ buffers. Called by `Schedule` at phase boundaries.

**Required schedule behavior**
At each phase boundary:

```ts
world.flush();
world.swapEvents();
```

---

## Internal Guarantees

* Archetypes use **Structure of Arrays (SoA)**
* Entity handles are generation-safe
* Component lookups are O(1) per archetype row
* Queries are archetype-filtered, not entity-scanned

---

## Error Conditions (Summary)

| Operation    | Error Condition          |
| ------------ | ------------------------ |
| add / remove | during query iteration   |
| add          | component already exists |
| remove       | component missing        |
| set          | component missing        |
| any          | stale entity             |

---

## Design Constraints

* Single-threaded
* No automatic conflict detection
* No parallel systems
* No borrowing model

These are **intentional** for simplicity and predictability.
