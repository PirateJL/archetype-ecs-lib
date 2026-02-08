# World Snapshots (Save and Load)

`World.snapshot()` and `World.restore()` let you persist ECS **data state** and rebuild the world later.

The key idea is: save only data that belongs to simulation state, and reconstruct runtime behavior from code.

---

## What is persisted

Snapshot payloads include:

* alive entities
* registered components (serialized through codecs)
* registered resources (serialized through codecs)
* allocator state (`nextId`, free-list, generations) so entity id reuse stays deterministic after load

---

## What is not persisted

Snapshot payloads intentionally exclude runtime-only behavior:

* systems
* schedules and phase graph
* pending commands
* event buffers/channels

After `restore(...)`, these are clean runtime state and should be set up by normal app boot code.

---

## Why codecs are explicit and opt-in

Snapshot registration is explicit (`registerComponentSnapshot`, `registerResourceSnapshot`) for three reasons:

1. **Stable identity**
   Runtime `TypeId` values are process-local. Snapshots need stable string keys like `"comp.position"`.
2. **Schema control**
   Not every field should be saved. A codec chooses exactly which data is persisted.
3. **Long-term compatibility**
   Save files can outlive one run. Explicit keys and payload shapes make migration/versioning manageable.

---

## Determinism goals

Snapshot export is deterministic for the same world state:

* entities are emitted in entity-id order
* component entries are emitted in snapshot-key order
* resource entries are emitted in snapshot-key order

This makes snapshots useful for debugging, test fixtures, and replay checkpoints.

---

## Long-term saves vs quick saves

The same snapshot format supports both:

* quick save/load in memory
* persisted saves (`JSON.stringify(snapshot)` to disk/DB/localStorage)

For long-term saves:

* keep codec keys stable
* if schema changes, migrate old payloads before `restore()`

---

## Mental model

Think of world snapshots as **state serialization**, not **engine serialization**:

* engine runtime is rebuilt
* simulation data is restored

That separation keeps the ECS data-oriented and engine-agnostic.
