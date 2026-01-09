# Resources (Singletons / World Globals)

Resources are **typed singleton values stored on the `World`**, keyed by a `ComponentCtor<T>` (same “key shape” as components). They are **not attached to entities**.

They’re ideal for global state like **Time**, **Input**, **Asset caches**, **Config**, **RNG**, **Selection**, etc.

---

## Concepts

### What is a Resource?

A resource is a **single instance of data** stored globally in the ECS `World`.

* **Components** → many per world, attached to entities
* **Resources** → one per key, stored in the world

### Key type: `ComponentCtor<T>`

All resource APIs use:

```ts
ComponentCtor<T>
```

This usually means:

* a **class constructor** (e.g. `class TimeRes { ... }`)
* or a **token function** (unique function used as a key)

Keys are compared by **identity** (reference equality), not by name.

---

## API summary

All methods live on `World` / `WorldApi`.

```ts
setResource<T>(key: ComponentCtor<T>, value: T): void
getResource<T>(key: ComponentCtor<T>): T | undefined
requireResource<T>(key: ComponentCtor<T>): T
hasResource<T>(key: ComponentCtor<T>): boolean
removeResource<T>(key: ComponentCtor<T>): boolean
initResource<T>(key: ComponentCtor<T>, factory: () => T): T
```

**Structural safety**: resource operations are **not structural changes** (unlike spawn/despawn/add/remove). They do not require flushing and are safe to call during system execution.

---

## Method reference

### `setResource<T>(key, value): void`

Stores (or replaces) the resource value for `key`.

**Behavior**

* Overwrites any existing value.
* Does not flush and does not affect archetypes.

**Example**

```ts
class ConfigRes { constructor(public difficulty: "easy" | "hard") {} }

world.setResource(ConfigRes, new ConfigRes("hard"));
```

---

### `getResource<T>(key): T | undefined`

Returns the resource value if present, otherwise `undefined`.

**Use when**

* the resource is **optional** (debug tools, plugins, editor-only state)

**Important note**

* If you **explicitly store `undefined`** as the value, this also returns `undefined`.
* Use `hasResource(key)` to distinguish:

  * “missing”
  * vs “present but undefined”

**Example**

```ts
const debug = world.getResource(DebugRes);
if (debug) debug.enabled = true;
```

---

### `requireResource<T>(key): T`

Returns the resource value if present, otherwise **throws**.

**Use when**

* the resource is **required** for correct operation (Time, Input, AssetCache, Config)

**Throws**

* `Error` if missing (your error message should mention how to insert it)

**Example**

```ts
const input = w.requireResource(InputStateRes);
if (input.keysDown.has("KeyW")) { /* ... */ }
```

---

### `hasResource<T>(key): boolean`

Checks whether an entry exists for `key`.

**Use when**

* you need to distinguish missing vs present-but-undefined
* you want conditional initialization

**Example**

```ts
if (!world.hasResource(TimeRes)) {
  world.setResource(TimeRes, new TimeRes());
}
```

---

### `removeResource<T>(key): boolean`

Removes the resource entry for `key`.

**Returns**

* `true` if the entry existed and was removed
* `false` otherwise

**Example**

```ts
world.removeResource(DebugRes);
```

---

### `initResource<T>(key, factory): T`

Insert-once helper.

**Behavior**

* If resource exists → returns existing value (factory is not called)
* If missing → calls `factory()`, stores, returns the new value

**Use when**

* bootstrapping default resources without double-init

**Example**

```ts
class TimeRes { dt = 0; elapsed = 0; }

world.initResource(TimeRes, () => new TimeRes());
```

---

## Usage patterns

### Pattern: “bootstrap required resources once”

```ts
class TimeRes { dt = 0; elapsed = 0; }
class InputStateRes { keysDown = new Set<string>(); }

world.initResource(TimeRes, () => new TimeRes());
world.initResource(InputStateRes, () => new InputStateRes());
```

### Pattern: “systems read required resources”

```ts
function timeSystem(w: WorldApi, dt: number) {
  const time = w.requireResource(TimeRes);
  time.dt = dt;
  time.elapsed += dt;
}
```

### Pattern: “asset cache resource”

```ts
class AssetCacheRes {
  images = new Map<string, HTMLImageElement>();
}

world.initResource(AssetCacheRes, () => new AssetCacheRes());
```

---

## Gotchas

### 1) Keys must be stable and unique

Because keys are identity-based:

* ✅ `class TimeRes {}` used as key is stable
* ✅ a top-level `const TOKEN = (() => {}) as ComponentCtor<T>` is stable
* ❌ creating a new token function inline each time won’t match previous entries

### 2) Prefer `requireResource()` in gameplay systems

It keeps systems clean and fails fast when initialization is missing.

### 3) Resources are not entities

Do not use resources for data that should exist per-entity (that’s components).
