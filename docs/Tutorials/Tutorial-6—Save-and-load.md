# Tutorial 6 - Save and load

Outcome: you will build a tiny save/load loop with `World.snapshot()` and `World.restore()`.

---

## 1) Create `tutorial6.ts`

```ts
import {
  World,
  type ComponentCtor,
  type SnapshotCodec,
  type WorldSnapshot
} from "archetype-ecs-lib";
```

---

## 2) Define components and resources

```ts
class Position {
  constructor(public x = 0, public y = 0) {}
}

class Health {
  constructor(public hp = 100) {}
}

class RunState {
  constructor(public wave = 1, public score = 0) {}
}

type SpawnRules = { cooldown: number };
const SpawnRulesToken = (() => ({ cooldown: 1.0 })) as ComponentCtor<SpawnRules>;
```

---

## 3) Create world and register snapshot codecs

```ts
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

const runStateCodec: SnapshotCodec<RunState, { wave: number; score: number }> = {
  key: "res.run-state",
  serialize: (v) => ({ wave: v.wave, score: v.score }),
  deserialize: (d) => new RunState(d.wave, d.score),
};

const spawnRulesCodec: SnapshotCodec<SpawnRules, { cooldown: number }> = {
  key: "res.spawn-rules",
  serialize: (v) => ({ cooldown: v.cooldown }),
  deserialize: (d) => ({ cooldown: d.cooldown }),
};

world.registerComponentSnapshot(Position, positionCodec);
world.registerComponentSnapshot(Health, healthCodec);
world.registerResourceSnapshot(RunState, runStateCodec);
world.registerResourceSnapshot(SpawnRulesToken, spawnRulesCodec);
```

---

## 4) Bootstrap some game state

```ts
world.setResource(RunState, new RunState(3, 1200));
world.setResource(SpawnRulesToken, { cooldown: 0.5 });

const e = world.spawn();
world.add(e, Position, new Position(10, 20));
world.add(e, Health, new Health(75));
```

---

## 5) Save

```ts
const snapshotA = world.snapshot();
const json = JSON.stringify(snapshotA);
console.log("Saved bytes:", json.length);
```

---

## 6) Mutate state (simulate gameplay)

```ts
const pos = world.get(e, Position)!;
pos.x = 99;
pos.y = 42;

world.requireResource(RunState).score += 300;
```

---

## 7) Load

```ts
const loaded = JSON.parse(json) as WorldSnapshot;
world.restore(loaded);
```

After restore, you get the original values from step 4:

```ts
console.log(world.get(e, Position)); // Position { x: 10, y: 20 }
console.log(world.requireResource(RunState)); // RunState { wave: 3, score: 1200 }
```

---

## 8) Useful pattern: baseline + quick save

```ts
const baseline = world.snapshot();
let quickSave: WorldSnapshot | null = null;

function saveNow() {
  quickSave = world.snapshot();
}

function loadNow() {
  if (quickSave) world.restore(quickSave);
}

function resetRun() {
  world.restore(baseline);
}
```

---

## 9) What to remember

* Register codecs before calling `restore`.
* Save files are plain data; systems/schedules are rebuilt by normal app boot code.
* Keep codec keys stable (`"comp.*"` / `"res.*"`) for long-term compatibility.
