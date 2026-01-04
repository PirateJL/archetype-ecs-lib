# What people mean by a “full ECS”

“ECS” can mean **just a storage model** (entities + components in some container), or it can mean an **entire game/app architecture** where *most runtime state and behavior* flows through an ECS **world + schedule + systems**.

A “full ECS” is typically an architecture where:

* **Entities** are only IDs/handles (no behavior).
* **Components** are only data.
* **Systems** are where behavior lives (pure-ish functions operating on data).
* A **World** is the single source of truth for runtime state.
* A **Scheduler** (or “app loop”) defines *when* systems run and in what order.
* Structural changes are controlled (often via a **command buffer**) so iteration stays safe and fast.

This library already contains several “full ECS” building blocks: **archetype tables (SoA)**, **queries**, **deferred commands**, and a **phase-based schedule**. 

What makes it “full” is less “do you use archetypes?” and more “does the ECS define the whole program’s execution model?”

---

## ECS as architecture, not just storage

### Storage-only ECS (not “full”)

This is common in small libs or quick implementations:

* Entities: IDs
* Components: data bags
* “Systems”: often just loops in user code
* Little/no scheduling model
* No consistent lifecycle for input → simulation → rendering
* Structural changes are ad-hoc

You *can* build a game with this, but the ECS isn’t the **organizing principle**—it’s a container.

### Architecture ECS (“full ECS”)

Here, ECS is the **spine of the app**:

* There’s a **main schedule** (often phases like `input → sim → render`).
* Systems are registered, ordered, and executed consistently each tick.
* Cross-cutting state is handled intentionally (resources/singletons, events, time, config).
* Structural changes are made safe/deterministic (command buffers, flush points).
* You get a uniform pattern for new features: “add data + add system”.

The `Schedule` explicitly models *phase ordering + flush barriers*, which is a key “architecture ECS” ingredient. 

---

## Difference between a library ECS and an engine ECS

### Library ECS

Goal: provide **core ECS mechanics**.

Typical traits:

* Focus on **storage + query performance** (archetypes/SoA) 
* Minimal assumptions about the rest of the program
* Simple scheduling (or none), often single-threaded
* You (the user) integrate input, rendering, physics, assets, scenes, etc.


### Engine ECS (Bevy / Unity DOTS / etc.)

Goal: ECS is the **entire runtime framework**.

Engine ECS usually includes (beyond a library):

* A full **app lifecycle** (startup, update, fixed update, shutdown)
* Integrated **input**, **rendering**, **audio**, **physics**, **animation**, **UI**
* Asset pipeline + hot reload + serialization
* Advanced scheduling: dependency graphs, system sets, run criteria, fixed timesteps
* Often **parallel execution** + conflict detection
* Tooling/editor integration

So: **library ECS = the “ECS core”**.
**engine ECS = ECS core + everything around it**, with ECS as the central organizing model.
