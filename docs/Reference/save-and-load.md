# Save and Load (World Snapshot) Reference

This page documents the snapshot API on `World`.

---

## Methods

### `registerComponentSnapshot<T, D>(key, codec): this`

Registers a component snapshot codec.

* `key: ComponentCtor<T>` is the component token/class used in ECS storage.
* `codec: SnapshotCodec<T, D>` defines:
  * `key: string` stable snapshot type key (for example `"comp.position"`)
  * `serialize(value: T): D`
  * `deserialize(data: D): T`

Notes:

* `codec.key` must be non-empty.
* Snapshot type keys must be unique per registry.
* Calling again with the same ctor replaces the previous codec.

---

### `unregisterComponentSnapshot<T>(key): boolean`

Removes a registered component snapshot codec.

Returns:

* `true` if removed
* `false` if none existed

---

### `registerResourceSnapshot<T, D>(key, codec): this`

Registers a resource snapshot codec.

Same rules as component registration.

---

### `unregisterResourceSnapshot<T>(key): boolean`

Removes a registered resource snapshot codec.

---

### `snapshot(): WorldSnapshot`

Exports world state.

Behavior:

* throws if called during iteration/structural lock
* flushes pending commands first
* serializes only registered components/resources
* returns deterministic ordering for entities/components/resources

---

### `restore(snapshot: WorldSnapshot): void`

Loads world state.

Behavior:

* throws if called during iteration/structural lock
* validates snapshot format string
* clears pending commands
* clears event channel buffers
* clears current resources
* restores allocator + entities + registered data

`restore()` does not restore systems/schedules.

---

## `SnapshotCodec<T, D>`

```ts
type SnapshotCodec<T, D = unknown> = {
  key: string;
  serialize(value: T): D;
  deserialize(data: D): T;
};
```

Guidelines:

* keep `key` stable across versions
* output JSON-safe data if you persist via `JSON.stringify`
* avoid embedding runtime handles/functions in codec data

---

## `WorldSnapshot` shape

```ts
type WorldSnapshot = {
  format: "archetype-ecs/world-snapshot@1";
  allocator: {
    nextId: number;
    free: number[];
    generations: Array<readonly [id: number, gen: number]>;
  };
  entities: Array<{
    id: number;
    gen: number;
    components: Array<{ type: string; data: unknown }>;
  }>;
  resources: Array<{ type: string; data: unknown }>;
};
```

---

## Persisted vs non-persisted

Persisted:

* alive entities
* registered components
* registered resources
* allocator state

Not persisted:

* systems
* schedules
* events
* command queue

---

## Error conditions (common)

* unsupported snapshot format
* duplicate snapshot type entries in payload
* missing codec for a component/resource type during restore
* invalid allocator/entity ids or generations
* entity id marked both alive and free

---

## Determinism guarantees

For the same world state and codec outputs:

* `entities` are ordered by entity id
* each entity `components` list is ordered by codec key
* `resources` list is ordered by codec key
