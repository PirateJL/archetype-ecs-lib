# Tutorial 2 — Components & archetypes

Outcome: you’ll *see* how component sets automatically form **archetypes (tables)**, and how entities “move” between them when you `add()` / `remove()` components—without digging into internals. Archetypes store data in **SoA** (one column per component type). 

---

## 1) Define a few component types

Create `tutorial2.ts`:

```ts
import { World } from "archetype-ecs-lib";

// Components are just data classes
class Position { constructor(public x = 0, public y = 0) {} }
class Velocity { constructor(public x = 0, public y = 0) {} }
class Health   { constructor(public hp = 100) {} }
```

The ECS uses component constructors as the “type key”, and archetypes store entities in SoA tables. 

---

## 2) Create a World and spawn entities with different component sets

```ts
const world = new World();

// e1 has: Position
const e1 = world.spawn();
world.add(e1, Position, new Position(1, 1));

// e2 has: Position + Velocity
const e2 = world.spawn();
world.add(e2, Position, new Position(0, 0));
world.add(e2, Velocity, new Velocity(1, 0));

// e3 has: Health
const e3 = world.spawn();
world.add(e3, Health, new Health(50));
```

---

## 3) Add a tiny helper to “see” matches

We can’t (and don’t need to) access archetype tables directly. Instead, we observe *which queries match*, before and after structural changes.

```ts
function ids(iter: Iterable<{ e: { id: number } }>): number[] {
  const out: number[] = [];
  for (const row of iter) out.push(row.e.id);
  return out.sort((a, b) => a - b);
}

function dump(label: string) {
  console.log(`\n=== ${label} ===`);
  console.log("Position:", ids(world.query(Position)));
  console.log("Velocity:", ids(world.query(Velocity)));
  console.log("Health:  ", ids(world.query(Health)));
  console.log("Pos+Vel: ", ids(world.query(Position, Velocity)));
  console.log("Pos+HP:  ", ids(world.query(Position, Health)));
}
```

The query API yields `{ e, c1, c2, ... }` rows in the order you request components. 

---

## 4) Observe the “automatic archetypes” effect

Add this and run once:

```ts
dump("initial");
```

You’ll see (by IDs) that:

* `e1` matches `Position` only
* `e2` matches both `Position` and `Pos+Vel`
* `e3` matches `Health` only

What this demonstrates: entities with the **same component set** are stored together (same archetype). Archetypes are created implicitly as you introduce new component combinations. 

---

## 5) Make an entity “move” between archetypes (add)

Now **add** a component to `e1`:

```ts
world.add(e1, Velocity, new Velocity(0, 2));
dump("after: add Velocity to e1");
```

You should see:

* `e1` now appears in `Velocity`
* and also in `Pos+Vel`

Why: `add()` is a **structural change** that can move an entity into a different archetype table (because its component set changed). 

---

## 6) Make an entity “move” between archetypes (remove)

Now **remove** `Position` from `e2`:

```ts
world.remove(e2, Position);
dump("after: remove Position from e2");
```

You should see:

* `e2` disappears from `Position` and `Pos+Vel`
* `e2` still appears in `Velocity`

Again: `remove()` is structural and can move the entity to a new archetype. 

---

## 7) Run it

```bash
npx tsx tutorial2.ts
```

---

## What you just learned (by doing)

* Components are plain data types (classes). 
* Archetypes (tables) are created automatically for each distinct component set, stored in **SoA** layout. 
* When you `add()`/`remove()` components, entities “move” because their component set changes (structural change). 

> Note for later tutorials: structural changes can be unsafe while iterating; that’s why `cmd()` + `flush()` exist. 
