# Integrating an ECS with Three.js

Three.js is a **rendering engine** (scene graph + GPU submission). This ECS is a **simulation architecture** (data in components, behavior in systems, ordered by a schedule, with safe structural changes via deferred commands + flush points).
Integrating them well means **letting each do what it’s good at**, and defining clean “hand-off” boundaries.

---

## The mental model: ECS drives state, Three.js draws it

A practical split that scales:

* **ECS World** = authoritative game/sim state (position, velocity, health, selection, etc.) 
* **Three.js Scene** = visual representation (Object3D transforms, meshes, materials, lights)

So the goal is not “put Three.js inside ECS”, but:

> **Systems write simulation state → a render-sync step pushes that state into Three.js objects.**

---

## Where ECS fits in the Three.js render loop

Three.js typically runs:

1. update (your code)
2. `renderer.render(scene, camera)`

With ECS, your “update” becomes scheduled phases, e.g.:

* `input` (read DOM/input, write components/resources)
* `sim` (gameplay, movement, AI)
* `render` (sync ECS → Three.js, then render)

The `Schedule` already supports this exact idea and flushes commands between phases to make entity/component creation/removal deterministic.

---

## Why flush points matter for Three.js integration

Spawning/despawning and add/remove are **structural changes** in this ECS and are expected to be deferred while iterating queries/systems.

That maps perfectly to Three.js object lifecycle:

* **During sim**: decide “this entity should appear/disappear” → enqueue ECS commands
* **At flush boundary**: ECS structure becomes stable
* **Render-sync phase**: create/remove corresponding `Object3D` safely, because you’re no longer mid-iteration on archetype tables

This is the same reason this ECS has `cmd()` / `flush()` and why `Schedule` flushes between phases.

---

## A clean integration pattern: “Renderable bridge” components

Common approach:

* A `Transform` component (position/rotation/scale) is owned by ECS.
* A `Renderable` component carries a reference/handle to what Three.js should draw (mesh id, model key, material key…).
* A render-sync system queries `(Transform, Renderable)` and applies changes to the corresponding `Object3D`.

Key idea: **ECS components store “what it is” and “where it is”**, while the actual `Mesh/Object3D` lives in Three.js.

This keeps:

* ECS portable (not tied to Three.js types everywhere)
* Three.js free to manage GPU resources

---

## One-way vs two-way sync (pick a source of truth)

Integration gets messy when both ECS and Three.js “own” transforms.

A scalable default:

* **ECS is the source of truth** for gameplay transforms.
* Three.js `Object3D` is just the projection of that state.

Only do **two-way sync** when you truly need it (editor gizmos, drag interactions). Even then, treat it as a controlled input step:

* read Object3D change in `input` or `tools` phase
* write back to ECS components
* let sim proceed from ECS again

---

## Why ECS does not replace Three.js (and shouldn’t try)

Even with a “full ECS” architecture, Three.js still owns:

* scene graph concerns (parenting, cameras, lights)
* GPU resource lifetimes (buffers, textures, materials)
* draw submission, sorting, batching, culling strategies

ECS complements that by making **simulation state and logic** scalable: archetype tables + queries + systems + scheduling.

---

## Scaling tips (when entity counts grow)

When you have many similar visuals:

* prefer **InstancedMesh** in Three.js
* let ECS systems produce instance transforms (dense arrays) from queries
* upload those transforms once per frame

This aligns with why archetype ECS exists: tight iteration over dense component columns. 
