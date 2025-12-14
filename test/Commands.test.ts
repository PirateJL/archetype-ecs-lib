import { Commands } from "../src/ecs/Commands";

describe("Commands", () => {
    class Position { constructor(public x = 0, public y = 0) {} }
    const e = { id: 1, gen: 1 } as const;

    test("queues commands and drains in order", () => {
        const cmd = new Commands();
        const init = jest.fn();

        cmd.spawn(init);
        cmd.add(e, Position, new Position(1, 2));
        cmd.remove(e, Position);
        cmd.despawn(e);

        const drained = cmd.drain();
        expect(drained).toHaveLength(4);

        expect(drained[0]).toEqual({ k: "spawn", init });
        expect(drained[1]).toEqual({ k: "add", e, ctor: Position, value: new Position(1, 2) });
        expect(drained[2]).toEqual({ k: "remove", e, ctor: Position });
        expect(drained[3]).toEqual({ k: "despawn", e });

        // second drain is empty
        expect(cmd.drain()).toEqual([]);
    });

    test("drain returns a copy and clears internal queue", () => {
        const cmd = new Commands();
        cmd.spawn();
        const a = cmd.drain();
        const b = cmd.drain();

        expect(a).toHaveLength(1);
        expect(b).toHaveLength(0);
    });
});
