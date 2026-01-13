# Reference: Events API

## Overview

Events are **typed, transient messages** used to decouple systems. They are stored per event type in **double-buffered channels**:

* `emit()` appends to the **write buffer** (current phase)
* `drain()` / `values()` read from the **read buffer** (previous phase)
* At each phase boundary, `world.swapEvents()` swaps buffers so events become visible to the next phase

### Key type

Event channels are keyed by `ComponentCtor<T>` (same as components/resources). Keys are compared by identity.

---

## `EventChannel<T>` (Events.ts)

### `emit(ev: T): void`

Appends an event to the **write buffer** for the current phase.

**Notes**

* Emitted events are **not readable in the same phase**
* They become readable after the next `swapBuffers()` / `world.swapEvents()`

---

### `drain(fn: (ev: T) => void): void`

Iterates all **readable events** (read buffer) and then **clears** that buffer.

**Semantics**

* Reads only events emitted in the **previous phase**
* After `drain`, `count()` becomes `0`

**Performance**

* No iterator allocations; uses indexed loop
* Clears with `length = 0`

---

### `values(): readonly T[]`

Returns a read-only view of the **read buffer**.

**Semantics**

* Snapshot is valid until the next boundary swap
* Do not store the returned array long-term

---

### `count(): number`

Returns the number of readable events currently in the **read buffer**.

---

### `clear(): void`

Clears the **read buffer** only.

---

### `clearAll(): void`

Clears both **read** and **write** buffers.

---

### `swapBuffers(): void` (internal)

Swaps read/write buffers and clears the new write buffer.

**Semantics**

* Makes events emitted in the previous phase readable now
* Drops any undrained events from the prior read buffer at the next swap (phase-scoped delivery)

---

## Delivery model summary (phase-scoped)

If you run phases:

`A -> B -> C`

Events emitted in **A** are readable in **B**.
If not drained in **B**, they are dropped at `B -> C` swap.
