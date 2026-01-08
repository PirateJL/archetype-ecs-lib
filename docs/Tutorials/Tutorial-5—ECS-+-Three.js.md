# Tutorial 5 — ECS + Three.js (render-sync + safe spawn/despawn)

Outcome: you’ll see **moving cubes** in Three.js, driven by your ECS. You’ll also **spawn** new cubes on click and **despawn** them safely using `cmd()` + **phase flush boundaries** (via `Schedule`). 

---

## 1) Create a new project

```bash
mkdir ecs-threejs-tutorial
cd ecs-threejs-tutorial
npm init -y

npm i archetype-ecs-lib three
npm i -D vite typescript
```

Your ECS package is installed as `archetype-ecs-lib`. 

---

## 2) Add `index.html`

Create `index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>ECS + Three.js Tutorial</title>
    <style>
      html, body { margin: 0; height: 100%; overflow: hidden; }
      #hud {
        position: fixed; left: 12px; top: 12px;
        padding: 8px 10px; border-radius: 8px;
        background: rgba(0,0,0,0.55); color: #fff;
        font-family: system-ui, sans-serif; font-size: 13px;
        user-select: none;
      }
    </style>
  </head>
  <body>
    <div id="hud">Click to spawn cubes</div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

---

## 3) Add `src/main.ts`

Create `src/main.ts`:

```ts
import * as THREE from "three";
import { World, WorldApi, Schedule, SystemFn } from "archetype-ecs-lib";

// --------------------
// Components (data only)
// --------------------
class Position { constructor(public x = 0, public y = 0, public z = 0) {} }
class Velocity { constructor(public x = 0, public y = 0, public z = 0) {} }
class Lifetime { constructor(public seconds = 2.0) {} }
class Renderable { constructor(public kind: "cube" = "cube") {} }

// --------------------
// Three.js setup
// --------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x101018);

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.set(0, 6, 14);
camera.lookAt(0, 0, 0);

const grid = new THREE.GridHelper(40, 40);
scene.add(grid);

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --------------------
// ECS setup
// --------------------
const world = new World();
const sched = new Schedule();

// Map ECS entities -> Three.js objects
// Use id+gen so reuse of ids never points to the wrong mesh.
const entityKey = (e: { id: number; gen: number }) => `${e.id}:${e.gen}`;
const objects = new Map<string, THREE.Object3D>();

function makeObject(r: Renderable): THREE.Object3D {
  // MeshNormalMaterial doesn't need lights
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshNormalMaterial();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}

// --------------------
// Input: click to spawn
// --------------------
let pendingClicks = 0;
window.addEventListener("pointerdown", () => pendingClicks++);

const inputPhase: SystemFn = (w: WorldApi) => {
  if (pendingClicks <= 0) return;

  const cmd = w.cmd();
  for (let i = 0; i < pendingClicks; i++) {
    cmd.spawn((e: any) => {
      // Spawn near origin with random velocity and short lifetime
      const x = (Math.random() - 0.5) * 8;
      const z = (Math.random() - 0.5) * 8;

      const vx = (Math.random() - 0.5) * 6;
      const vz = (Math.random() - 0.5) * 6;

      cmd.addBundle(
        e,
        [new Position(x, 0.5, z), new Velocity(vx, 0, vz), new Lifetime(2.0 + Math.random() * 2.0), new Renderable("cube")]
      );
    });
  }

  pendingClicks = 0;
}

// --------------------
// Simulation: movement
// --------------------
const movementSystem: SystemFn = (w: WorldApi, dt: number) => {
  for (const { c1: pos, c2: vel } of w.query(Position, Velocity)) {
    pos.x += vel.x * dt;
    pos.y += vel.y * dt;
    pos.z += vel.z * dt;

    // simple bounds bounce
    const limit = 12;
    if (pos.x < -limit || pos.x > limit) vel.x *= -1;
    if (pos.z < -limit || pos.z > limit) vel.z *= -1;
  }
}

// --------------------
// Simulation: lifetime -> despawn (deferred)
// --------------------
const lifetimeSystem: SystemFn = (w: WorldApi, dt: number) => {
  for (const { e, c1: life } of w.query(Lifetime)) {
    life.seconds -= dt;
    if (life.seconds <= 0) {
      w.cmd().despawn(e); // structural change deferred
    }
  }
}

// --------------------
// Render phase: ECS -> Three.js sync + remove despawned
// --------------------
const renderSync: SystemFn = (w: WorldApi) => {
  const alive = new Set<string>();

  // Create/update objects for all renderables
  for (const { e, c1: pos, c2: rend } of w.query(Position, Renderable)) {
    const key = entityKey(e);
    alive.add(key);

    let obj = objects.get(key);
    if (!obj) {
      obj = makeObject(rend);
      scene.add(obj);
      objects.set(key, obj);
    }

    obj.position.set(pos.x, pos.y, pos.z);
  }

  // Remove objects whose entities are gone
  for (const [key, obj] of objects) {
    if (!alive.has(key)) {
      scene.remove(obj);
      objects.delete(key);
    }
  }
}

// --------------------
// Schedule: phase ordering + flush boundaries
// --------------------
// Schedule runs phases in order and calls world.flush() after each phase. :contentReference[oaicite:2]{index=2}
sched.add("input", inputPhase);
sched.add("sim", movementSystem);
sched.add("sim", lifetimeSystem);
sched.add("render", renderSync);

const phases = ["input", "sim", "render"];

// --------------------
// Animation loop
// --------------------
let last = performance.now();

function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  // Run ECS phases (flush after each phase)
  sched.run(world, dt, phases);

  // Render Three.js
  renderer.render(scene, camera);

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

// Spawn a few cubes at start (via commands so it behaves like gameplay)
pendingClicks = 6;
```

This uses:

* `Schedule.add(phase, fn)` and `Schedule.run(world, dt, phases)` with flush between phases 
* `world.query(A, B)` yielding `{ e, c1, c2 }` 
* deferred structural ops via `cmd().spawn/add/despawn` 

---

## 4) Run it

```bash
npx vite
```

Open the local URL Vite prints.

---

## 5) What to try (hands-on)

1. **Click** to spawn cubes
2. Watch them move (ECS `Position` + `Velocity`)
3. Watch them disappear after a few seconds (`Lifetime` → `cmd().despawn(e)`), and see the Three.js mesh removed automatically in `renderSync()`.

That’s the “safe loop”:

* structural requests happen inside systems using `cmd()`
* structural changes become real at flush boundaries (Schedule phases)
* render-sync runs on a stable world snapshot 
