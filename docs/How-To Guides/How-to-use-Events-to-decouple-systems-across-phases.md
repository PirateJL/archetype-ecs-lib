# How to use Events to decouple systems across phases

## Goal

Emit events in one phase and consume them in a later phase, without coupling systems directly.

This guide assumes you already have a `Schedule` with multiple phases and that the schedule swaps events between phases.

---

## 1) Define event types

Use classes (recommended) or token keys.

```ts
export class DamageEvent {
    constructor(public target: Entity, public amount: number) {}
}

export class PlaySoundEvent {
    constructor(public id: string) {}
}
```

---

## 2) Emit events from a producer system

Example: gameplay system emits damage + sound.

```ts
function combatSystem(w: WorldApi, _dt: number) {
    // ... detect hit
    w.emit(DamageEvent, new DamageEvent(target, 10));
    w.emit(PlaySoundEvent, new PlaySoundEvent("hit"));
}
```

---

## 3) Consume events in the next phase

Place a consumer in the **next** phase (phase-scoped delivery):

```ts
function applyDamageSystem(w: WorldApi, _dt: number) {
    w.drainEvents(DamageEvent, (ev) => {
        const hp = w.get(ev.target, Health);
        if (!hp) return;
        hp.value -= ev.amount;
    });
}
```

Schedule order:

```ts
schedule.add(world, "update", combatSystem);
schedule.add(world, "afterUpdate", applyDamageSystem);
```

---

## 4) Deliver events to late phases (forwarding pattern)

With phase-scoped delivery, an event emitted in `update` is visible in `afterUpdate`.
If you want it to reach `audio` several phases later, forward it:

```ts
function forwardSoundSystem(w: WorldApi, _dt: number) {
    w.drainEvents(PlaySoundEvent, (ev) => {
        w.emit(PlaySoundEvent, ev); // re-emit for the next phase
    });
}

function audioSystem(w: WorldApi, _dt: number) {
    w.drainEvents(PlaySoundEvent, (ev) => {
        console.log("[audio] play:", ev.id);
    });
}
```

Example pipeline:

```ts
schedule.add(world, "update", combatSystem);            // emits PlaySoundEvent
schedule.add(world, "afterUpdate", forwardSoundSystem); // forwards -> render
schedule.add(world, "afterRender", forwardSoundSystem); // forwards -> audio
schedule.add(world, "audio", audioSystem);              // consumes
```

---

## 5) Use `events(key).values()` for read-only inspection

If you need to check what’s readable without consuming it:

```ts
const pending = w.events(DamageEvent).values();
if (pending.length > 0) {
    // inspect (do not store array reference)
}
```

Prefer `drainEvents` for typical processing.

---

## 6) Clear events when resetting state

To clear one type:

```ts
w.clearEvents(DamageEvent);
```

To clear all readable event buffers:

```ts
w.clearEvents();
```
