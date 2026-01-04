# ECS and the game loop

ECS is best understood as the **way you organize game state and game logic**, not as the thing that *does everything*. In a typical game, the loop still has input, rendering, audio, physics, networking, etc. ECS provides a **consistent place** for runtime data (components) and behavior (systems), plus a **schedule** that defines when that behavior runs. This library already models this explicitly with `World.update(dt)` and with a phase-based `Schedule` that flushes between phases. 

---

## Frame phases

A “frame” is rarely just “update then draw”. Most games are structured in phases, even if informally. A common conceptual breakdown:

1. **Input**: read devices/events, translate into game intent
2. **Simulation**: movement, AI, gameplay rules, timers
3. **Physics** (optional separate step): integrate, solve collisions, constraints
4. **Post-sim**: resolve gameplay outcomes, spawn/despawn, apply state transitions
5. **Render prep**: build renderable data, sort, cull
6. **Render**: submit to GPU / engine renderer
7. **End-of-frame**: cleanup, present frame, etc.

The `Schedule` is designed exactly for this idea: you define phases (strings) and run them in order, with `flush()` after each phase. 

---

## Where ECS fits

ECS typically fits in the **simulation and render-prep** parts of the loop:

* **World** holds the mutable runtime state (entities + components) 
* **Systems** implement the game logic by querying components and mutating them
* **Commands** allow safe structural changes during those systems (`cmd()` → `flush()`) 
* **Schedule** provides deterministic ordering and safe mutation boundaries between phases 

A useful mental model:

* Rendering engines want a *renderable snapshot* (meshes, transforms, materials, draw lists).
* Input systems produce *intent/state* (move left, fire, target position).
* Physics engines operate on *physical representations* (bodies, colliders).

ECS sits in the middle coordinating these, not replacing them.

### A concrete mapping using this primitives

* **Input phase**: read input → write `InputState` component / resource → enqueue spawns/despawns if needed
* `flush()`
* **Sim phase**: run movement/AI/gameplay using queries → update `Position`, `Velocity`, etc.
* `flush()`
* **Render phase**: build lightweight render data (`RenderTransform`, `Visible`, etc.) → hand off to renderer

This is why “flush points” exist in an ECS schedule: they define when the world structure is allowed to change and when the next phase sees those changes. 

---

## Why ECS does not replace rendering, input, or physics engines

### Rendering

A renderer is a specialized pipeline:

* GPU resources, shaders, batching, sorting, culling
* frame graph / render passes
* platform-specific backends

ECS is not a GPU pipeline. What ECS does well is:

* storing render-related data as components (`Transform`, `Renderable`, `MaterialRef`, etc.)
* running systems that prepare and synchronize data for the renderer

So ECS often produces a **render list** or updates engine scene objects, but the renderer still does the rendering.

### Input

Input is inherently eventful and platform-driven:

* OS/window events
* device state polling
* mapping raw events to game actions

ECS can *store* input state (`InputAxis`, `ActionPressed`, etc.) and *process* it in systems, but it doesn’t replace the platform input layer. In practice:

* platform collects input
* ECS system transforms it into gameplay-friendly state

### Physics

Physics engines are optimized solvers:

* broadphase / narrowphase collision detection
* integrators and constraint solvers
* continuous collision, joints, sleeping, etc.

ECS can represent physics **data** (mass, collider type, desired forces) and drive the physics engine, but the solver itself is a dedicated subsystem.

A common integration pattern:

* ECS → write forces/desired velocity into physics engine
* Physics step happens
* Physics results → write back transforms/velocities into ECS

---

## The key idea: ECS is the *coordination model*

ECS shines when you treat it as:

* **a data model** for game state (components)
* **a behavior model** for game logic (systems)
* **an execution model** for ordering (schedule + phases + flush points) 

But rendering/input/physics are specialized domains with their own constraints and pipelines. ECS coordinates them by being the “truth” for game state and by running the logic that translates between subsystems.
