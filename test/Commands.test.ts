import { Commands, type Entity } from "../src";

class Position
{
    constructor(public x = 0, public y = 0) { }
}
class Velocity
{
    constructor(public vx = 0, public vy = 0) { }
}
class Frozen
{
    constructor(public reason = "stopped") { }
}

describe("Commands", () => {
    test("spawn() enqueues a spawn command (with optional init)", () => {
        const c = new Commands();

        const init = jest.fn();
        c.spawn(init);

        const ops = c.drain();
        expect(ops).toHaveLength(1);
        expect(ops[0]).toEqual({ k: "spawn", init });
    });

    test("spawnBundle() enqueues a spawn command (first drain) and enqueues adds when init is executed (second drain)", () => {
        const c = new Commands();

        const p = new Position(1, 2);
        const v = new Velocity(3, 4);

        c.spawnBundle([Position, p], [Velocity, v]);

        // 1st drain: only the spawn op
        const ops1 = c.drain();
        expect(ops1).toHaveLength(1);
        expect(ops1[0].k).toBe("spawn");

        // Narrow union before accessing `.init`
        const cmd0 = ops1[0];
        if (cmd0.k !== "spawn") throw new Error("Expected spawn command");

        expect(cmd0.init).toBeDefined();
        expect(typeof cmd0.init).toBe("function");

        // simulate World applying spawn + calling init(e)
        const e: Entity = { id: 123, gen: 1 };
        cmd0.init!(e);

        // 2nd drain: init should have enqueued add ops (in order)
        const ops2 = c.drain();
        expect(ops2).toEqual([
            { k: "add", e, ctor: Position, value: p },
            { k: "add", e, ctor: Velocity, value: v },
        ]);
    });

    test("spawnBundle() with no items still spawns and init enqueues nothing", () => {
        const c = new Commands();

        c.spawnBundle();

        const ops1 = c.drain();
        expect(ops1).toHaveLength(1);
        expect(ops1[0].k).toBe("spawn");

        const cmd0 = ops1[0];
        if (cmd0.k !== "spawn") throw new Error("Expected spawn command");

        const e: Entity = { id: 1, gen: 0 };
        cmd0.init?.(e);

        expect(c.drain()).toEqual([]);
    });

    test("despawn() enqueues a despawn command", () => {
        const c = new Commands();
        const e: Entity = { id: 1, gen: 0 };

        c.despawn(e);

        const ops = c.drain();
        expect(ops).toEqual([{ k: "despawn", e }]);
    });

    test("despawnBundle() enqueues one despawn per entity (in order)", () => {
        const c = new Commands();
        const e1: Entity = { id: 1, gen: 0 };
        const e2: Entity = { id: 2, gen: 0 };
        const e3: Entity = { id: 3, gen: 0 };

        c.despawnBundle([e1, e2, e3]);

        const ops = c.drain();
        expect(ops).toEqual([
            { k: "despawn", e: e1 },
            { k: "despawn", e: e2 },
            { k: "despawn", e: e3 },
        ]);
    });

    test("despawnBundle() with empty list enqueues nothing", () => {
        const c = new Commands();
        c.despawnBundle([]);
        expect(c.drain()).toEqual([]);
    });

    test("add() enqueues an add command", () => {
        const c = new Commands();
        const e: Entity = { id: 1, gen: 0 };
        const p = new Position(9, 9);

        c.add(e, Position, p);

        const ops = c.drain();
        expect(ops).toEqual([{ k: "add", e, ctor: Position, value: p }]);
    });

    test("addBundle() enqueues multiple add commands (in order)", () => {
        const c = new Commands();
        const e: Entity = { id: 1, gen: 0 };
        const p = new Position(1, 2);
        const v = new Velocity(3, 4);
        const f = new Frozen("test");

        c.addBundle(e, [Position, p], [Velocity, v], [Frozen, f]);

        const ops = c.drain();
        expect(ops).toEqual([
            { k: "add", e, ctor: Position, value: p },
            { k: "add", e, ctor: Velocity, value: v },
            { k: "add", e, ctor: Frozen, value: f },
        ]);
    });

    test("addBundle() with no items enqueues nothing", () => {
        const c = new Commands();
        const e: Entity = { id: 1, gen: 0 };

        c.addBundle(e);
        expect(c.drain()).toEqual([]);
    });

    test("remove() enqueues a remove command", () => {
        const c = new Commands();
        const e: Entity = { id: 1, gen: 0 };

        c.remove(e, Velocity);

        const ops = c.drain();
        expect(ops).toEqual([{ k: "remove", e, ctor: Velocity }]);
    });

    test("removeBundle() enqueues multiple remove commands (in order)", () => {
        const c = new Commands();
        const e: Entity = { id: 1, gen: 0 };

        c.removeBundle(e, Velocity, Frozen);

        const ops = c.drain();
        expect(ops).toEqual([
            { k: "remove", e, ctor: Velocity },
            { k: "remove", e, ctor: Frozen },
        ]);
    });

    test("removeBundle() with no ctors enqueues nothing", () => {
        const c = new Commands();
        const e: Entity = { id: 1, gen: 0 };

        c.removeBundle(e);
        expect(c.drain()).toEqual([]);
    });

    test("drain() clears the queue", () => {
        const c = new Commands();
        const e: Entity = { id: 1, gen: 0 };

        c.despawn(e);
        expect(c.drain()).toHaveLength(1);

        // second drain should be empty
        expect(c.drain()).toEqual([]);
    });
});
