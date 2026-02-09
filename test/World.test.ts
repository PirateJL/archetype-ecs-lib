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

    test("spawn is forbidden during query iteration", () => {
        const w = new World();
        const e = w.spawn();
        w.add(e, Position, new Position(1, 2));

        expect(() => {
            w.queryEach(Position, () => {
                w.spawn();
            });
        }).toThrow(/Cannot do structural change \(spawn\)/i);
    });

    test("spawnMany is forbidden during query iteration", () => {
        const w = new World();
        const e = w.spawn();
        w.add(e, Position, new Position(1, 2));

        expect(() => {
            w.queryEach(Position, () => {
                w.spawnMany([Velocity, new Velocity()]);
            });
        }).toThrow(/Cannot do structural change \(spawn\)/i);
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
