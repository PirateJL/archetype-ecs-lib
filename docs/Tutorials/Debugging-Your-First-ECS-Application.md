# Debugging Your First ECS Application

In this tutorial, you'll learn how to use the built-in debugging tools to understand and optimize your ECS application.

## Prerequisites

- Basic familiarity with the ECS library
- A working browser-based project
- About 15 minutes

## What You'll Build

A simple simulation with intentional performance issues that you'll identify and fix using the debugging tools.

---

## Step 1: Create a World with Stats Overlay

Create a new file `debug-tutorial.ts`:

```typescript
import { World } from "archetype-ecs-lib";

// Create world - overlay appears automatically
const world = new World({
    statsOverlayOptions: {
        width: 400,
        height: 100
    }
});
world.setDebugging(true);

console.log("World created! Look for the stats overlay in the top-left corner.");
```


Run your application. You should see the ECS Stats overlay appear.

**Checkpoint**: The overlay should show:
- Frame 0
- Archetypes: 1
- Alive entities: 0

---

## Step 2: Add Some Entities

Let's spawn some entities and watch the stats update:

```typescript
// Components
class Position { constructor(public x = 0, public y = 0) {} }
class Velocity { constructor(public vx = 0, public vy = 0) {} }

// Spawn 100 moving entities
for (let i = 0; i < 100; i++) {
    const e = world.spawn();
    world.add(e, Position, new Position(Math.random() * 800, Math.random() * 600));
    world.add(e, Velocity, new Velocity(Math.random() * 2 - 1, Math.random() * 2 - 1));
}

console.log("Spawned 100 entities");
```


**Checkpoint**: The overlay should now show:
- Archetypes: 2 (empty + Position+Velocity)
- Alive entities: 100
- Rows: 100

---

## Step 3: Add a Movement System

```typescript
function movementSystem(world: World, dt: number) {
    for (const { e, c1: pos, c2: vel } of world.query(Position, Velocity)) {
        pos.x += vel.vx * dt * 60;
        pos.y += vel.vy * dt * 60;
    }
}

world.addSystem(movementSystem);
```


---

## Step 4: Create the Game Loop

```typescript
let lastTime = performance.now();

function gameLoop() {
    const now = performance.now();
    const dt = (now - lastTime) / 1000;
    lastTime = now;
    
    world.update(dt);
    
    requestAnimationFrame(gameLoop);
}

gameLoop();
```


**Checkpoint**:
- Watch the frame counter increment
- The graph should show blue bars (fast frames)
- `frame=` should be very low (< 1ms)

---

## Step 5: Introduce a Performance Problem

Let's add a "bad" system that creates performance issues:

```typescript
function expensiveSystem(world: World, dt: number) {
    // Simulate expensive computation
    for (const { e, c1: pos } of world.query(Position)) {
        // Intentionally slow: nested loop
        let sum = 0;
        for (let i = 0; i < 10000; i++) {
            sum += Math.sin(pos.x + i) * Math.cos(pos.y + i);
        }
        (pos as any)._temp = sum; // Store result
    }
}

world.addSystem(expensiveSystem);
```


**Checkpoint**:
- Watch `frame=` time increase dramatically
- Red bars should appear in the graph
- Click to see phase timings in the console

---

## Step 6: Identify the Slow System

Open your browser's developer console and click the button on the overlay to enable debug logging.

You'll see the output something like:

```
Phases: update=45.23ms
```


But we need per-system timing! The overlay shows this when using named functions:

Look at the overlay carefully. With profiling enabled, you'll see which system takes the most time.

---

## Step 7: Fix the Performance Issue

Now that we've identified `expensiveSystem` as the problem, let's optimize it:

```typescript
// Option 1: Process fewer entities per frame
let processedThisFrame = 0;
function optimizedExpensiveSystem(world: World, dt: number) {
    processedThisFrame = 0;
    for (const { e, c1: pos } of world.query(Position)) {
        if (processedThisFrame++ > 10) break; // Only process 10 per frame
        
        let sum = 0;
        for (let i = 0; i < 10000; i++) {
            sum += Math.sin(pos.x + i) * Math.cos(pos.y + i);
        }
        (pos as any)._temp = sum;
    }
}

// Replace the bad system (in real code, you'd remove and re-add)
```


---

## Step 8: Verify the Fix

After applying the optimization:

**Checkpoint**:
- `frame=` time should drop significantly
- Graph should return to mostly blue bars
- Console logging should show lower phase times

---

## Step 9: Explore Archetype Fragmentation

Let's intentionally cause archetype fragmentation:

```typescript
class TempMarker {}

function fragmentingSystem(world: World, dt: number) {
    for (const { e } of world.query(Position)) {
        // Bad pattern: constantly adding/removing components
        if (Math.random() > 0.5) {
            if (!world.has(e, TempMarker)) {
                world.add(e, TempMarker, new TempMarker());
            }
        } else {
            if (world.has(e, TempMarker)) {
                world.remove(e, TempMarker);
            }
        }
    }
}

world.addSystem(fragmentingSystem);
```


**Checkpoint**:
- Watch the "Archetypes" counter grow
- This indicates archetype fragmentation

---

## Step 10: Clean Up

Remove the debugging artifacts when going to production:

```typescript
// Disable profiling for release builds
if (process.env.NODE_ENV === "production") {
    world.setProfilingEnabled(false);
    world.destroyOverlay();
}
```


---

## Summary

In this tutorial, you learned how to:

1. Create a World with the stats overlay
2. Read entity and archetype counts
3. Identify slow systems using frame timing
4. Enable console debug logging
5. Recognize archetype fragmentation
6. Disable debugging tools for production

## Next Steps

- Read the [Understanding ECS Debugging & Profiling](../Explanation/Understanding-ECS-Debugging-&-Profiling.md) to understand what the metrics mean
- Check the [Debugging & Profiling Reference](../Reference/debugging.md) for all available options
- Explore the [How to Debug Your ECS Application](../How-To%20Guides/How-to-Debug-Your-ECS-Application.md) for optimization techniques
