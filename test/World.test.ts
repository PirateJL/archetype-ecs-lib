import { World, WorldApi } from "../src";

class Position { constructor(public x = 0, public y = 0) {} }
class Velocity { constructor(public dx = 0, public dy = 0) {} }
class Health { constructor(public hp = 0) {} }

describe("World", () => {
    let logSpy: jest.SpyInstance;

    beforeEach(() => {
        logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
    });

    afterEach(() => {
        logSpy.mockRestore();
    });

    it("spawns entities alive with no components", () => {
        const w = new World();
        const e = w.spawn();

        expect(w.isAlive(e)).toBe(true);
        expect(w.has(e, Position)).toBe(false);
        expect(w.get(e, Position)).toBeUndefined();
    });

    it("spawn an entity alive with many components", () => {
        const w = new World();
        const e = w.spawnMany(
            [Position, new Position()],
            [Velocity, new Velocity()]
        );

        expect(w.isAlive(e)).toBe(true);
        expect(w.has(e, Position)).toBe(true);
        expect(w.has(e, Velocity)).toBe(true);
        expect(w.get(e, Velocity)).toBeDefined();
        expect(w.get(e, Velocity)).toBeDefined();
    });

    it("add/addMany/get/set/remove/removeMany components", () => {
        const w = new World();
        const e = w.spawn();

        w.add(e, Position, new Position(1, 2));
        expect(w.has(e, Position)).toBe(true);
        expect(w.get(e, Position)).toEqual({ x: 1, y: 2 });

        w.addMany(e, [Velocity, new Velocity()], [Health, new Health(100)]);
        expect(w.has(e, Velocity)).toBe(true);
        expect(w.has(e, Health)).toBe(true);
        expect(w.get(e, Velocity)).toEqual({ dx: 0, dy: 0 });
        expect(w.get(e, Health)).toEqual({ hp: 100 });

        w.set(e, Position, new Position(9, 8));
        expect(w.get(e, Position)).toEqual({ x: 9, y: 8 });

        w.remove(e, Position);
        expect(w.has(e, Position)).toBe(false);
        expect(w.get(e, Position)).toBeUndefined();

        w.removeMany(e, Velocity, Health);
        expect(w.has(e, Velocity)).toBe(false);
        expect(w.has(e, Health)).toBe(false);
        expect(w.get(e, Velocity)).toBeUndefined();
        expect(w.get(e, Health)).toBeUndefined();
    });

    it("add overwrites in-place if component already exists", () => {
        const w = new World();
        const e = w.spawn();

        w.add(e, Position, new Position(1, 1));
        w.add(e, Position, new Position(2, 2));

        expect(w.get(e, Position)).toEqual({ x: 2, y: 2 });
    });

    it("set throws if component is missing", () => {
        const w = new World();
        const e = w.spawn();

        expect(() => w.set(e, Position, new Position(1, 1))).toThrow("set(Position) requires component to exist on e#1@1; use add()");
    });

    it("add/set/remove component should throw, if entity is not alive and get component should be undefined", () => {
        const w = new World();
        const e = w.spawn();
        w.despawn(e);

        expect(() => w.add(e, Position, new Position(1, 1))).toThrow(/add\(Position\) failed: stale entity/i);
        expect(w.get(e, Position)).toBeUndefined();
        expect(() => w.set(e, Position, new Position(9, 9))).toThrow(/set\(Position\) failed: stale entity/i);
        expect(() => w.remove(e, Position)).toThrow(/remove\(Position\) failed: stale entity/i);
    });

    it("despawn makes entity dead and handle becomes invalid", () => {
        const w = new World();
        const e1 = w.spawn();
        w.add(e1, Position, new Position(1, 2));

        w.despawn(e1);
        expect(w.isAlive(e1)).toBe(false);
        expect(w.get(e1, Position)).toBeUndefined();

        // entity id should be reused (free-list), generation bumped
        const e2 = w.spawn();
        expect(e2.id).toBe(e1.id);
        expect(e2.gen).toBe(e1.gen + 1);
        expect(w.isAlive(e2)).toBe(true);
    });

    it("despawn many entities, expect them to be dead", () => {
        const w = new World();
        const e1 = w.spawn();
        const e2 = w.spawn();
        const e3 = w.spawn();

        w.despawnMany([e1, e2, e3]);

        expect(w.isAlive(e1)).toBe(false);
        expect(w.isAlive(e2)).toBe(false);
        expect(w.isAlive(e3)).toBe(false);
    });

    it("query returns entities that have required components", () => {
        const w = new World();
        const e1 = w.spawn();
        const e2 = w.spawn();
        const e3 = w.spawn();

        w.add(e1, Position, new Position(1, 1));
        w.add(e1, Velocity, new Velocity(10, 0));

        w.add(e2, Position, new Position(2, 2));

        w.add(e3, Velocity, new Velocity(0, 20));

        const posOnly = Array.from(w.query(Position)).map(r => ({ id: r.e.id, p: r.c1 })).sort((a, b) => a.id - b.id);
        expect(posOnly).toEqual([
            { id: e1.id, p: { x: 1, y: 1 } },
            { id: e2.id, p: { x: 2, y: 2 } },
        ]);

        const posVel = Array.from(w.query(Position, Velocity)).map(r => ({ id: r.e.id, p: r.c1, v: r.c2 }));
        expect(posVel).toEqual([
            { id: e1.id, p: { x: 1, y: 1 }, v: { dx: 10, dy: 0 } },
        ]);
    });

    test("returns components in the same order as ctor arguments (2 components)", () => {
        // Isolate module state so TypeRegistry's global TypeId counter resets for this test.
        jest.isolateModules(() => {
            const { World } = require("../src");

            class Position {
                constructor(public x = 0, public y = 0) {}
            }
            class Velocity {
                constructor(public dx = 0, public dy = 0) {}
            }

            const world = new World();
            const e = world.spawn();

            // IMPORTANT: Register Velocity first so it likely gets a smaller TypeId than Position.
            const vel = new Velocity(1, 2);
            const pos = new Position(3, 4);
            world.add(e, Velocity, vel);
            world.add(e, Position, pos);

            const rows: any[] = Array.from(world.query(Position, Velocity));
            expect(rows).toHaveLength(1);

            // Expected API contract:
            // query(Position, Velocity) -> { e, c1: Position, c2: Velocity }
            expect(rows[0].e).toBe(e);
            expect(rows[0].c1).toBe(pos);
            expect(rows[0].c2).toBe(vel);
        });
    });

    test("returns components in the same order as ctor arguments (3 components)", () => {
        jest.isolateModules(() => {
            const { World } = require("../src");

            class A { constructor(public v = "a") {} }
            class B { constructor(public v = "b") {} }
            class C { constructor(public v = "c") {} }

            const world = new World();
            const e = world.spawn();

            // Register in a different order so TypeIds won't match requested query order.
            const c = new C("C");
            const b = new B("B");
            const a = new A("A");
            world.add(e, C, c);
            world.add(e, B, b);
            world.add(e, A, a);

            const rows: any[] = Array.from(world.query(A, B, C));
            expect(rows).toHaveLength(1);

            // query(A, B, C) -> { e, c1: A, c2: B, c3: C }
            expect(rows[0].e).toBe(e);
            expect(rows[0].c1).toBe(a);
            expect(rows[0].c2).toBe(b);
            expect(rows[0].c3).toBe(c);
        });
    });

    it("prevents structural changes during query iteration", () => {
        const w = new World();
        const e1 = w.spawn();
        w.add(e1, Position, new Position(1, 1));

        const iter = w.query(Position)[Symbol.iterator]();
        const first = iter.next();
        expect(first.done).toBe(false);

        expect(() => w.add(e1, Velocity, new Velocity(1, 1))).toThrow(/Cannot do structural change/i);
        expect(() => w.remove(e1, Position)).toThrow(/Cannot do structural change/i);
        expect(() => w.despawn(e1)).toThrow(/Cannot do structural change/i);

        // exhausting iterator should clear the flag (finally)
        while (!iter.next().done) {}

        // now should work
        expect(() => w.add(e1, Velocity, new Velocity(1, 1))).not.toThrow();
    });

    test("during update(): direct add/remove/despawn throws, cmd() queues and flush applies", () => {
        const w = new World();
        const e = w.spawn();

        w.addSystem((world: WorldApi) => {
            expect(() => world.add(e, Position, new Position(1, 2))).toThrow(/Use world\.cmd\(\)/i);
            expect(() => world.remove(e, Position)).toThrow(/Use world\.cmd\(\)/i);
            expect(() => world.despawn(e)).toThrow(/Use world\.cmd\(\)/i);

            world.cmd().add(e, Position, new Position(7, 8));
        });

        w.update(0);

        expect(w.has(e, Position)).toBe(true);
        expect(w.get(e, Position)).toMatchObject({ x: 7, y: 8 });
    });

    test("update() flushes queued commands even if a system throws", () => {
        const w = new World();
        const e = w.spawn();

        w.addSystem((world: WorldApi) => {
            world.cmd().add(e, Position, new Position(1, 1));
            throw new Error("boom");
        });

        expect(() => w.update(0)).toThrow("boom");

        // command should still have been applied in finally { flush() }
        expect(w.has(e, Position)).toBe(true);
        expect(w.get(e, Position)).toMatchObject({ x: 1, y: 1 });
    });

    test("update() flushes queued commands successfully", () => {
        const w = new World();
        const e = w.spawnMany([Position, new Position(1, 1)], [Velocity, new Velocity(1, 1)])

        w.addSystem((world: WorldApi) => {
            world.cmd().remove(e, Velocity);
            world.cmd().despawn(e);
        });

        w.update(0);

        // commands have been applied
        expect(w.has(e, Position)).toBe(false);
        expect(w.isAlive(e)).toBe(false);
    });
});
