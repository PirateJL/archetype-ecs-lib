# How to Debug Your ECS Application

## How to Enable the Stats Overlay

The stats overlay is automatically created when you instantiate a `World` in a browser environment.
However, to enable and show it, use the function `setDebugging` to true.

```typescript
import { World } from "archetype-ecs-lib";

const world = new World();
world.setDebugging(true);
// Overlay appears automatically in top-left corner
```

### Customizing Overlay Position and Appearance

```typescript
const world = new World({
    statsOverlayOptions: {
        left: 10,           // X position in pixels
        top: 10,            // Y position in pixels
        width: 400,         // Canvas width
        height: 100,        // Canvas height
        targetFrameMs: 16.67,  // Target frame time (60 FPS)
        slowFrameMs: 20,       // Threshold for "slow" frames
        maxSamples: 240        // History length in frames
    }
});
```

### Attaching to a Custom Container

```typescript
const debugPanel = document.getElementById("debug-panel");

const world = new World({
    statsOverlayOptions: {
        parent: debugPanel
    }
});
```


---

## How to Identify Slow Systems

### Step 1: Enable Profiling (On by Default)

```typescript
world.setProfilingEnabled(true);
```


### Step 2: Check the Overlay

Look at the "Phases" line in the stats overlay. Systems are shown with their execution time:

```
Phases: update=5.23ms render=2.10ms physics=1.50ms
```


### Step 3: Enable Console Logging for Details

Click the button to toggle console debug logging. Each frame will log phase timings:

```
Phases: update=5.23ms render=2.10ms physics=1.50ms
```


### Step 4: Analyze the History Graph

Red bars indicate frames exceeding the slow threshold. Look for patterns:

- Isolated spikes → Likely GC or async operations
- Periodic spikes → Check fixed-interval systems
- Sustained red → System needs optimization

---

## How to Debug Entity Lifecycle Issues

### Finding "Lost" Entities

If entity counts don't match expectations:

```typescript
// Check stats for current counts
const stats = world.stats();
console.log(`Alive: ${stats.aliveEntities}, Rows: ${stats.rows}`);

// Iterate to find entities with specific components
for (const { e, c1 } of world.query(Position)) {
    console.log(`Entity ${e.id} has Position:`, c1);
}
```


### Detecting Stale Entity References

```typescript
const entity = world.spawn();
world.despawn(entity);

// Later...
if (!world.isAlive(entity)) {
    console.warn("Entity was despawned:", entity);
}
```


### Tracking Pending Commands

The overlay shows "Pending commands: true/false". If commands aren't being applied:

```typescript
// Commands are deferred
world.cmd().spawn();
console.log(world.stats().pendingCommands); // true

// After flush
world.flush();
console.log(world.stats().pendingCommands); // false
```


---

## How to Debug Archetype Fragmentation

### Symptoms

- High archetype count relative to entity count
- Performance degradation over time
- Memory growth

### Diagnosis

```typescript
const stats = world.stats();
const ratio = stats.archetypes / stats.aliveEntities;

if (ratio > 0.1) {  // More than 1 archetype per 10 entities
    console.warn("Possible archetype fragmentation");
}
```


### Common Causes

1. **Frequent component add/remove cycles**
```typescript
// Bad: Creates new archetypes constantly
world.add(e, TempMarker, {});
world.remove(e, TempMarker);
```


2. **Unique component combinations per entity**
```typescript
// Bad: Each entity gets unique archetype
world.add(e, UniqueId, { id: generateUuid() });
world.add(e, CreatedAt, { time: Date.now() });
```


### Solutions

- Use resources for singleton data
- Use component values instead of presence/absence for flags
- Batch component changes with `addMany()` / `removeMany()`

---

## How to Disable the Overlay in Production

```typescript
// Option 1: Conditional creation
const world = new World();
world.setDebugging(process.env.NODE_ENV === "development");

// Option 2: Destroy after creation
const world = new World();
world.destroyOverlay();
```