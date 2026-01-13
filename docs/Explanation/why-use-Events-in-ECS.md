# Why use Events in ECS?

## Events solve a different problem than Components and Resources

ECS has three kinds of data:

* **Components**: persistent, per-entity state (Position, Velocity, Health)
* **Resources**: persistent, global state (Input, Time, Config, caches)
* **Events**: transient messages (Hit happened, Click happened, Play sound)

Trying to represent “something happened” as a component usually causes awkward designs:

* adding/removing “Event components” becomes structural churn
* you need cleanup systems to remove them
* multiple systems race to observe/remove them

Events avoid that by being explicitly transient.

---

## Events reduce coupling between systems

Without events:

* `combatSystem` might call `audioSystem` directly
* or it might mutate a shared global array

With events:

* producers don’t know consumers exist
* consumers don’t know who produced the messages

This keeps systems reusable and easy to rearrange in your `Schedule`.

---

## Why double-buffering?

A common bug in event systems is “events appear while I’m iterating”.

Double-buffering prevents that:

* consumers read a stable snapshot (`read buffer`)
* producers write to a different buffer (`write buffer`)
* swap happens at deterministic boundaries

No surprises. No iterator invalidation. No mid-phase visibility.

---

## Why phase-scoped delivery?

This ECS already has a concept of **phase boundaries**:

* structural changes are deferred via Commands
* `flush()` applies them between phases

Events align with the same boundary:

* `swapEvents()` delivers events between phases

This makes it easy to design pipelines:

* `input` produces actions → `beforeUpdate` consumes
* `update` produces gameplay events → `afterUpdate` consumes
* `render` produces UI/VFX events → `afterRender` consumes
* `audio` consumes sound events

---

## Trade-offs (and the forwarding pattern)

With phase-scoped delivery, an event is visible in the **next phase only**.
To deliver an event across multiple phases (e.g., from `update` to `audio`), you forward it by draining and re-emitting.

This is deliberate:

* it keeps pipelines explicit
* prevents “stale” events lingering through unrelated phases
* makes delivery deterministic and easy to debug
