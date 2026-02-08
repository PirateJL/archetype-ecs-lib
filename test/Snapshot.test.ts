import { type ComponentCtor, type SnapshotCodec, type WorldSnapshot, World } from "../src";

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

function buildPositionCodec(key: string): SnapshotCodec<Position, { x: number; y: number }>
{
    return {
        key,
        serialize: (v) => ({ x: v.x, y: v.y }),
        deserialize: (data) => new Position(data.x, data.y)
    };
}

function buildVelocityCodec(key: string): SnapshotCodec<Velocity, { dx: number; dy: number }>
{
    return {
        key,
        serialize: (v) => ({ dx: v.dx, dy: v.dy }),
        deserialize: (data) => new Velocity(data.dx, data.dy)
    };
}

function buildSaveStateCodec(key: string): SnapshotCodec<SaveStateRes, { slot: string; tick: number }>
{
    return {
        key,
        serialize: (v) => ({ slot: v.slot, tick: v.tick }),
        deserialize: (data) => new SaveStateRes(data.slot, data.tick)
    };
}

function buildSeedCodec(key: string): SnapshotCodec<SeedRes, { seed: number }>
{
    return {
        key,
        serialize: (v) => ({ seed: v.seed }),
        deserialize: (data) => ({ seed: data.seed })
    };
}

function cloneSnapshot(snapshot: WorldSnapshot): WorldSnapshot
{
    return JSON.parse(JSON.stringify(snapshot)) as WorldSnapshot;
}

function baseSnapshotWithOneEntity(): WorldSnapshot
{
    return {
        format: "archetype-ecs/world-snapshot@1",
        allocator: {
            nextId: 2,
            free: [],
            generations: [[1, 1]]
        },
        entities: [{
            id: 1,
            gen: 1,
            components: []
        }],
        resources: []
    };
}

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

    test("snapshot flushes pending commands and skips missing registered resources", () => {
        const world = new World();
        world.registerComponentSnapshot(Position, positionCodec);
        world.registerResourceSnapshot(SaveStateRes, saveStateCodec);

        const entity = world.spawn();
        world.cmd().add(entity, Position, new Position(12, 34));

        const snapshot = world.snapshot();
        expect(snapshot.entities).toHaveLength(1);
        expect(snapshot.entities[0]!.components).toEqual([{ type: "comp.position", data: { x: 12, y: 34 } }]);
        expect(snapshot.resources).toEqual([]);
    });

    test("register/unregister component snapshots handle conflicts, rekeys, and validation", () => {
        const world = new World();

        expect(world.unregisterComponentSnapshot(Position)).toBe(false);
        world.registerComponentSnapshot(Position, buildPositionCodec("comp.temp"));
        expect(world.unregisterComponentSnapshot(Position)).toBe(true);

        world.registerComponentSnapshot(Position, buildPositionCodec("comp.position.v1"));
        expect(() => world.registerComponentSnapshot(Velocity, buildVelocityCodec("comp.position.v1")))
            .toThrow(/key already used/i);

        const e = world.spawn();
        world.add(e, Position, new Position(5, 6));
        const oldSnapshot = world.snapshot();

        world.registerComponentSnapshot(Position, buildPositionCodec("comp.position.v2"));
        expect(() => world.restore(oldSnapshot)).toThrow(/Missing component snapshot codec/i);

        expect(() => world.registerComponentSnapshot(Position, buildPositionCodec("   "))).toThrow(/codec.key must be a non-empty string/i);
    });

    test("register/unregister resource snapshots handle conflicts, rekeys, and validation", () => {
        const world = new World();

        expect(world.unregisterResourceSnapshot(SaveStateRes)).toBe(false);
        world.registerResourceSnapshot(SaveStateRes, buildSaveStateCodec("res.temp"));
        expect(world.unregisterResourceSnapshot(SaveStateRes)).toBe(true);

        world.registerResourceSnapshot(SaveStateRes, buildSaveStateCodec("res.save.v1"));
        expect(() => world.registerResourceSnapshot(SeedResToken, buildSeedCodec("res.save.v1")))
            .toThrow(/key already used/i);

        world.setResource(SaveStateRes, new SaveStateRes("slot-z", 77));
        const oldSnapshot = world.snapshot();

        world.registerResourceSnapshot(SaveStateRes, buildSaveStateCodec("res.save.v2"));
        expect(() => world.restore(oldSnapshot)).toThrow(/Missing resource snapshot codec/i);

        expect(() => world.registerResourceSnapshot(SaveStateRes, buildSaveStateCodec("   "))).toThrow(/codec.key must be a non-empty string/i);
    });

    test("restore rejects unsupported snapshot format", () => {
        const world = new World();
        const snapshot = world.snapshot();
        const invalid = cloneSnapshot(snapshot) as any;
        invalid.format = "other-format@1";

        expect(() => world.restore(invalid as WorldSnapshot)).toThrow(/Unsupported world snapshot format/i);
    });

    test("restore rejects duplicate snapshot resource types", () => {
        const source = new World();
        source.registerResourceSnapshot(SaveStateRes, saveStateCodec);
        source.setResource(SaveStateRes, new SaveStateRes("slot-a", 1));

        const snapshot = cloneSnapshot(source.snapshot()) as any;
        snapshot.resources.push(snapshot.resources[0]);

        const destination = new World();
        destination.registerResourceSnapshot(SaveStateRes, saveStateCodec);
        expect(() => destination.restore(snapshot as WorldSnapshot)).toThrow(/Duplicate snapshot resource type/i);
    });

    test("restore rejects missing resource codec", () => {
        const source = new World();
        source.registerResourceSnapshot(SaveStateRes, saveStateCodec);
        source.setResource(SaveStateRes, new SaveStateRes("slot-a", 2));
        const snapshot = source.snapshot();

        const destination = new World();
        expect(() => destination.restore(snapshot)).toThrow(/Missing resource snapshot codec/i);
    });

    test("restore rejects invalid entity id", () => {
        const world = new World();
        const snapshot = baseSnapshotWithOneEntity() as any;
        snapshot.entities[0].id = 0;

        expect(() => world.restore(snapshot as WorldSnapshot)).toThrow(/Invalid snapshot entity id/i);
    });

    test("restore rejects invalid entity generation", () => {
        const world = new World();
        const snapshot = baseSnapshotWithOneEntity() as any;
        snapshot.entities[0].gen = 0;

        expect(() => world.restore(snapshot as WorldSnapshot)).toThrow(/Invalid snapshot entity generation/i);
    });

    test("restore rejects duplicate entity ids", () => {
        const world = new World();
        const snapshot = baseSnapshotWithOneEntity() as any;
        snapshot.entities.push({ id: 1, gen: 1, components: [] });

        expect(() => world.restore(snapshot as WorldSnapshot)).toThrow(/Duplicate snapshot entity id/i);
    });

    test("restore rejects entity id that is both alive and free", () => {
        const world = new World();
        const snapshot = baseSnapshotWithOneEntity() as any;
        snapshot.allocator.free = [1];

        expect(() => world.restore(snapshot as WorldSnapshot)).toThrow(/both alive and free/i);
    });

    test("restore rejects missing allocator generation entry for an alive entity", () => {
        const world = new World();
        const snapshot = baseSnapshotWithOneEntity() as any;
        snapshot.entities[0].id = 2;
        snapshot.allocator.nextId = 3;
        snapshot.allocator.generations = [[1, 1]];

        expect(() => world.restore(snapshot as WorldSnapshot)).toThrow(/missing allocator generation entry/i);
    });

    test("restore rejects duplicate component types on a single entity", () => {
        const world = new World();
        world.registerComponentSnapshot(Position, positionCodec);

        const snapshot = baseSnapshotWithOneEntity() as any;
        snapshot.entities[0].components = [
            { type: "comp.position", data: { x: 1, y: 2 } },
            { type: "comp.position", data: { x: 3, y: 4 } }
        ];

        expect(() => world.restore(snapshot as WorldSnapshot)).toThrow(/Duplicate component type/i);
    });

    test("snapshot and restore throw while iterating", () => {
        const world = new World();
        const e = world.spawn();
        world.add(e, Position, new Position(1, 2));

        expect(() => {
            world.queryEach(Position, () => {
                world.snapshot();
            });
        }).toThrow(/Cannot do structural change \(snapshot\) while iterating/i);

        const snap = world.snapshot();
        expect(() => {
            world.queryEach(Position, () => {
                world.restore(snap);
            });
        }).toThrow(/Cannot do structural change \(restore\) while iterating/i);
    });

    test("snapshot tolerates sparse archetype array entries", () => {
        const world = new World();
        world.registerComponentSnapshot(Position, positionCodec);
        const e = world.spawn();
        world.add(e, Position, new Position(7, 9));

        (world as any).archetypes.push(undefined);

        const snapshot = world.snapshot();
        expect(snapshot.entities[0]!.components[0]!.type).toBe("comp.position");
    });

    test("snapshot tolerates entity metadata pointing to an unknown archetype id", () => {
        const world = new World();
        world.registerComponentSnapshot(Position, positionCodec);
        const e = world.spawn();
        world.add(e, Position, new Position(10, 20));

        (world as any).entities.meta[e.id].arch = 999;
        (world as any).entities.meta[e.id].row = 0;

        const snapshot = world.snapshot();
        expect(snapshot.entities).toHaveLength(1);
        expect(snapshot.entities[0]!.components).toEqual([]);
    });
});
