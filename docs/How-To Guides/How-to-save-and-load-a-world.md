# How to save and load a World

This guide shows a complete save/load flow:

1. register snapshot codecs
2. create a snapshot
3. persist to JSON
4. restore later

---

## 1) Define data components/resources

```ts
class Position {
  constructor(public x = 0, public y = 0) {}
}

class Health {
  constructor(public hp = 100) {}
}

class GameState {
  constructor(public wave = 1, public score = 0) {}
}

type SpawnConfig = { interval: number };
const SpawnConfigToken = (() => ({ interval: 1.0 })) as ComponentCtor<SpawnConfig>;
```

---

## 2) Register snapshot codecs once at boot

```ts
import { SnapshotCodec, World, type ComponentCtor } from "archetype-ecs-lib";

const world = new World();

const positionCodec: SnapshotCodec<Position, { x: number; y: number }> = {
  key: "comp.position",
  serialize: (v) => ({ x: v.x, y: v.y }),
  deserialize: (d) => new Position(d.x, d.y),
};

const healthCodec: SnapshotCodec<Health, { hp: number }> = {
  key: "comp.health",
  serialize: (v) => ({ hp: v.hp }),
  deserialize: (d) => new Health(d.hp),
};

const gameStateCodec: SnapshotCodec<GameState, { wave: number; score: number }> = {
  key: "res.game-state",
  serialize: (v) => ({ wave: v.wave, score: v.score }),
  deserialize: (d) => new GameState(d.wave, d.score),
};

const spawnConfigCodec: SnapshotCodec<SpawnConfig, { interval: number }> = {
  key: "res.spawn-config",
  serialize: (v) => ({ interval: v.interval }),
  deserialize: (d) => ({ interval: d.interval }),
};

world.registerComponentSnapshot(Position, positionCodec);
world.registerComponentSnapshot(Health, healthCodec);
world.registerResourceSnapshot(GameState, gameStateCodec);
world.registerResourceSnapshot(SpawnConfigToken, spawnConfigCodec);
```

Only registered types are persisted.

---

## 3) Create a snapshot and persist it

```ts
const snapshot = world.snapshot();
const json = JSON.stringify(snapshot);

localStorage.setItem("save-slot-1", json);
```

---

## 4) Restore from persisted JSON

```ts
const raw = localStorage.getItem("save-slot-1");
if (raw) {
  const snapshot = JSON.parse(raw);
  world.restore(snapshot);
}
```

`restore()` will clear runtime queues (pending commands/events) and reconstruct persisted entity/resource state.

---

## 5) Common pattern: baseline + quick save

```ts
const baseline = world.snapshot(); // after bootstrap
let quickSave: ReturnType<World["snapshot"]> | null = null;

function doQuickSave() {
  quickSave = world.snapshot();
}

function doQuickLoad() {
  if (quickSave) world.restore(quickSave);
}

function resetRun() {
  world.restore(baseline);
}
```

---

## 6) Important checks

* Register codecs before calling `restore(...)`.
* Keep codec keys stable across versions.
* Ensure codec output is JSON-safe if you store saves as JSON.
* Re-register systems/schedules in app boot code (they are runtime behavior, not snapshot data).
