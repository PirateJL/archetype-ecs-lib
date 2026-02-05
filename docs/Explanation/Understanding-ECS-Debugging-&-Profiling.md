# Understanding ECS Debugging & Profiling

## Why Debugging ECS is Different

Entity Component System architectures present unique debugging challenges compared to traditional object-oriented code. Instead of inspecting individual objects with encapsulated state, you're dealing with:

- **Entities**: Just numeric IDs with no inherent meaning
- **Components**: Data scattered across archetype tables
- **Systems**: Functions that operate on query results, not objects
- **Deferred operations**: Commands that execute later, not when called

This separation of data and logic makes traditional breakpoint debugging less intuitive. You can't simply "step into" an entity to see what it's doing.

## The Stats Overlay Philosophy

The built-in stats overlay provides **runtime observability** rather than step-through debugging. It answers questions like:

- "How many entities exist right now?"
- "Which systems are slow?"
- "Are my archetypes fragmenting?"
- "Is my frame budget being exceeded?"

This approach aligns with how games and simulations are typically debugged—by observing the running system rather than pausing it.

## What the Metrics Mean

### Entity & Archetype Counts

The relationship between **alive entities**, **archetypes**, and **rows** tells you about your data layout:

| Metric          | Healthy Sign       | Warning Sign                      |
|-----------------|--------------------|-----------------------------------|
| Archetypes      | Stable, low count  | Growing unboundedly               |
| Rows ≈ Entities | Close match        | Large gap indicates fragmentation |
| Entities        | Predictable growth | Unexpected spikes                 |

**Archetype explosion** occurs when entities frequently add/remove components, creating many unique component combinations. Each unique combination requires its own archetype table.

### Frame Timing

The overlay tracks two time measurements:

- **dt**: Delta time passed to `update()` (what your game logic sees)
- **frame**: Actual wall-clock time spent in the update (what the CPU experiences)

When `frame` consistently exceeds `dt`, you're falling behind real-time.

### Phase & System Timing

With the `Schedule` API, systems are grouped into phases. The overlay shows:

- Per-phase total time
- Per-system time (when profiling is enabled)

This helps identify which phase or system is the bottleneck.

## Profiling History

The overlay maintains a rolling history (default: 120 frames) displayed as a bar graph:

- **Blue bars**: Frames within budget (≤ slow threshold)
- **Red bars**: Slow frames (> slow threshold)
- **White line**: Target frame time

Patterns in this graph reveal:

- **Periodic spikes**: Often garbage collection or physics sync
- **Gradual increase**: Memory leak or unbounded growth
- **Consistent red**: Fundamental performance problem

## Debug Logging

The / toggle enables console output of phase timings each frame. This is useful for:

- Capturing timing data for analysis
- Correlating visual stutters with logged spikes
- Automated performance regression testing