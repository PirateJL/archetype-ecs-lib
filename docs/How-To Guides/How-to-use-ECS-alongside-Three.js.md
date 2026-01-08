# How to use ECS alongside Three.js

## Pattern: ECS owns state, Three.js owns objects

1. Keep Three.js objects in a map (outside ECS):

```ts
const meshes = new Map<number, THREE.Object3D>(); // key = entity.id
```

2. Add components for simulation and “render tag”:

```ts
class Position { constructor(public x=0, public y=0, public z=0) {} }
class Renderable { constructor(public kind: "cube" | "ship" = "cube") {} }
```

3. Spawn entities in ECS:

```ts
const e = world.spawnMany(
  new Position(0, 0, 0),
  new Renderable("cube")
)
```

4. Create a **render-sync** system in a `render` phase:

* create missing meshes
* update transforms
* remove meshes for despawned entities (see step 5)

```ts
sched.add("render", (w: any) => {
  for (const { e, c1: pos, c2: rend } of w.query(Position, Renderable)) {
    let obj = meshes.get(e.id);
    if (!obj) {
      obj = makeObjectFromKind(rend.kind); // your factory
      scene.add(obj);
      meshes.set(e.id, obj);
    }
    obj.position.set(pos.x, pos.y, pos.z);
  }
});
```

5. Despawn visually **after flush**:

* despawn in ECS via `cmd().despawn(e)`
* after the flush boundary, remove from `meshes` if it’s gone

A simple cleanup pass each frame:

```ts
for (const [id, obj] of meshes) {
  // if you track alive entities externally, remove when not alive anymore.
  // (One common approach: record seen IDs during the render query and remove the rest.)
}
```
