import { type ComponentCtor, type SnapshotCodec, World } from "../src";

class Position {
    constructor(public x = 0, public y = 0) { }
}

class Velocity {
    constructor(public dx = 0, public dy = 0) { }
}

class SaveStateRes {
    constructor(public slot = "", public tick = 0) { }
}

class RuntimeOnlyRes {
    constructor(public enabled = false) { }
}

class PingEvent {
    constructor(public value = 0) { }
}

type Energy = { value: number };
const EnergyToken: ComponentCtor<Energy> = () => ({ value: 0 });

type SeedRes = { seed: number };
const SeedResToken: ComponentCtor<SeedRes> = () => ({ seed: 0 });

const positionCodec: SnapshotCodec<Position, { x: number; y: number }> = {
    key: "comp.position",
    serialize: (v) => ({ x: v.x, y: v.y }),
    deserialize: (data) => new Position(data.x, data.y)
};

const velocityCodec: SnapshotCodec<Velocity, { dx: number; dy: number }> = {
    key: "comp.velocity",
    serialize: (v) => ({ dx: v.dx, dy: v.dy }),
    deserialize: (data) => new Velocity(data.dx, data.dy)
};

const energyCodec: SnapshotCodec<Energy, { value: number }> = {
    key: "comp.energy",
    serialize: (v) => ({ value: v.value }),
    deserialize: (data) => ({ value: data.value })
};

const saveStateCodec: SnapshotCodec<SaveStateRes, { slot: string; tick: number }> = {
    key: "res.save-state",
    serialize: (v) => ({ slot: v.slot, tick: v.tick }),
    deserialize: (data) => new SaveStateRes(data.slot, data.tick)
};

const seedCodec: SnapshotCodec<SeedRes, { seed: number }> = {
    key: "res.seed",
    serialize: (v) => ({ seed: v.seed }),
    deserialize: (data) => ({ seed: data.seed })
};

describe("World snapshot/restore", () => {
    test("persists only registered data and supports class + function tokens", () => {
        const world = new World();
        world.registerComponentSnapshot(Position, positionCodec);
        world.registerComponentSnapshot(EnergyToken, energyCodec);
        world.registerResourceSnapshot(SaveStateRes, saveStateCodec);
        world.registerResourceSnapshot(SeedResToken, seedCodec);

        const entity = world.spawn();
        world.addMany(
            entity,
            [Position, new Position(3, 4)],
            [Velocity, new Velocity(9, 10)],
            [EnergyToken, { value: 42 }]
        );
        world.setResource(SaveStateRes, new SaveStateRes("slot-a", 7));
        world.setResource(RuntimeOnlyRes, new RuntimeOnlyRes(true));
        world.setResource(SeedResToken, { seed: 1337 });

        const snapshot = world.snapshot();

        const loaded = new World();
        loaded.registerComponentSnapshot(Position, positionCodec);
        loaded.registerComponentSnapshot(EnergyToken, energyCodec);
        loaded.registerResourceSnapshot(SaveStateRes, saveStateCodec);
        loaded.registerResourceSnapshot(SeedResToken, seedCodec);
        loaded.restore(snapshot);

        const rows = Array.from(loaded.query(Position, EnergyToken));
        expect(rows).toHaveLength(1);
        expect(rows[0]!.c1).toEqual({ x: 3, y: 4 });
        expect(rows[0]!.c2).toEqual({ value: 42 });
        expect(loaded.has(rows[0]!.e, Velocity)).toBe(false);

        expect(loaded.requireResource(SaveStateRes)).toEqual({ slot: "slot-a", tick: 7 });
        expect(loaded.requireResource(SeedResToken)).toEqual({ seed: 1337 });
        expect(loaded.getResource(RuntimeOnlyRes)).toBeUndefined();
    });

    test("snapshot order is deterministic by entity id and snapshot key", () => {
        const world = new World();
        world.registerComponentSnapshot(Velocity, velocityCodec);
        world.registerComponentSnapshot(Position, positionCodec);
        world.registerResourceSnapshot(SeedResToken, seedCodec);
        world.registerResourceSnapshot(SaveStateRes, saveStateCodec);

        const e1 = world.spawn();
        const e2 = world.spawn();
        world.addMany(e1, [Position, new Position(1, 1)], [Velocity, new Velocity(2, 2)]);
        world.add(e2, Velocity, new Velocity(3, 3));
        world.setResource(SeedResToken, { seed: 9 });
        world.setResource(SaveStateRes, new SaveStateRes("slot-b", 11));

        const snapshot = world.snapshot();

        expect(snapshot.entities.map((e) => e.id)).toEqual([1, 2]);
        expect(snapshot.entities[0]!.components.map((c) => c.type)).toEqual(["comp.position", "comp.velocity"]);
        expect(snapshot.entities[1]!.components.map((c) => c.type)).toEqual(["comp.velocity"]);
        expect(snapshot.resources.map((r) => r.type)).toEqual(["res.save-state", "res.seed"]);
    });

    test("restored allocator preserves future id/gen allocation order", () => {
        const world = new World();
        const e1 = world.spawn();
        world.spawn();
        const e3 = world.spawn();

        world.despawn(e1);
        world.despawn(e3);

        const snapshot = world.snapshot();
        const expectedA = world.spawn();
        const expectedB = world.spawn();

        const loaded = new World();
        loaded.restore(snapshot);
        const actualA = loaded.spawn();
        const actualB = loaded.spawn();

        expect(actualA).toEqual(expectedA);
        expect(actualB).toEqual(expectedB);
    });

    test("restore clears runtime queues/events from destination world", () => {
        const source = new World();
        source.spawn();
        const snapshot = source.snapshot();

        const destination = new World();
        const pending = destination.spawn();
        destination.cmd().despawn(pending);
        destination.emit(PingEvent, new PingEvent(123));
        destination.swapEvents();

        destination.restore(snapshot);

        expect(destination.stats().pendingCommands).toBe(false);
        const events: PingEvent[] = [];
        destination.drainEvents(PingEvent, (ev) => events.push(ev));
        expect(events).toEqual([]);
    });

    test("restore fails when a required component snapshot codec is missing", () => {
        const source = new World();
        source.registerComponentSnapshot(Position, positionCodec);

        const entity = source.spawn();
        source.add(entity, Position, new Position(8, 9));
        const snapshot = source.snapshot();

        const destination = new World();
        expect(() => destination.restore(snapshot)).toThrow(/Missing component snapshot codec/i);
    });
});
