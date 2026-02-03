# Debugging & Profiling Reference

## StatsOverlayOptions

Configuration options passed to `World` constructor.

```typescript
type StatsOverlayOptions = Readonly<{
    parent?: HTMLElement;
    left?: number;
    top?: number;
    width?: number;
    height?: number;
    targetFrameMs?: number;
    slowFrameMs?: number;
    maxSamples?: number;
}>;
```


| Option          | Type          | Default         | Description                       |
|-----------------|---------------|-----------------|-----------------------------------|
| `parent`        | `HTMLElement` | `document.body` | Container element for the overlay |
| `left`          | `number`      | `8`             | Left offset in pixels             |
| `top`           | `number`      | `8`             | Top offset in pixels              |
| `width`         | `number`      | `320`           | Canvas width in pixels            |
| `height`        | `number`      | `80`            | Canvas height in pixels           |
| `targetFrameMs` | `number`      | `16.67`         | Target frame time (white line)    |
| `slowFrameMs`   | `number`      | `20`            | Slow frame threshold (red bars)   |
| `maxSamples`    | `number`      | `240`           | Number of frames in history graph |

---

## WorldStats

Returned by `world.stats()`.

```typescript
type WorldStats = Readonly<{
    aliveEntities: number;
    archetypes: number;
    rows: number;
    systems: number;
    resources: number;
    eventChannels: number;
    pendingCommands: boolean;
    frame: number;
    dt: number;
    frameMs: number;
    phaseMs: Record<string, number>;
    systemMs: Record<string, number>;
}>;
```


| Field             | Description                                  |
|-------------------|----------------------------------------------|
| `aliveEntities`   | Count of non-despawned entities              |
| `archetypes`      | Number of unique component combinations      |
| `rows`            | Total rows across all archetype tables       |
| `systems`         | Number of registered systems                 |
| `resources`       | Number of stored resources                   |
| `eventChannels`   | Number of active event channels              |
| `pendingCommands` | Whether command queue has pending operations |
| `frame`           | Current frame counter                        |
| `dt`              | Delta time passed to last `update()` call    |
| `frameMs`         | Wall-clock time of last frame                |
| `phaseMs`         | Per-phase timing breakdown                   |
| `systemMs`        | Per-system timing breakdown                  |

---

## WorldStatsHistory

Returned by `world.statsHistory()`.

```typescript
type WorldStatsHistory = Readonly<{
    capacity: number;
    size: number;
    dt: ReadonlyArray<number>;
    frameMs: ReadonlyArray<number>;
    phaseMs: Record<string, ReadonlyArray<number>>;
    systemMs: Record<string, ReadonlyArray<number>>;
}>;
```


| Field       | Description                     |
|-------------|---------------------------------|
| `capacity`  | Maximum frames stored           |
| `size`      | Current number of frames stored |
| `dt`        | Rolling history of delta times  |
| `frameMs`   | Rolling history of frame times  |
| `phaseMs`   | Per-phase timing history        |
| `systemMs`  | Per-system timing history       |

---

## Profiling API

### `world.setProfilingEnabled(enabled: boolean)`

Enable or disable a timing collection. When disabled, `frameMs`, `phaseMs`, and `systemMs` will be `0`.

### `world.setProfilingHistorySize(frames: number)`

Set the rolling history capacity. Existing history is trimmed if reduced.

---

## Overlay API

### `world.setDebugging(enabled: boolean)`

Enable or disable the stats overlay.  
When disabled, the method `world.destroyOverlay()` is called.

### `world.destroyOverlay()`

Remove the stats overlay from the DOM and clean up event listeners.

### `world.updateOverlay(stats, history)`

Manually trigger an overlay render. Called automatically by `world.update()` and `schedule.run()`.

---

## Overlay UI Elements

| Element        | Function                                   |
|----------------|--------------------------------------------|
| **Title bar**  | Drag to reposition overlay                 |
| **/ button**   | Toggle console debug logging               |
| **−/+ button** | Collapse/expand overlay content            |
| **Graph**      | Frame time history visualization           |
| **Legend**     | Target line, OK bars, Slow bars thresholds |
