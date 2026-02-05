import { World } from "../src";
import { Position } from "./Mocks/Position.mock";
import { Velocity } from "./Mocks/Velocity.mock";

describe("Query", () => {
    let world: World;

    beforeEach(() => {
        world = new World();
    })

    it("query returns entities that have required components", () => {
        const e1 = world.spawn();
        const e2 = world.spawn();
        const e3 = world.spawn();

        world.add(e1, Position, new Position(1, 1));
        world.add(e1, Velocity, new Velocity(10, 0));

        world.add(e2, Position, new Position(2, 2));

        world.add(e3, Velocity, new Velocity(0, 20));

        const posOnly = Array.from(world.query(Position))
            .map(r => ({ id: r.e.id, p: r.c1 }))
            .sort((a, b) => a.id - b.id);

        expect(posOnly).toEqual([
            { id: e1.id, p: { x: 1, y: 1 } },
            { id: e2.id, p: { x: 2, y: 2 } },
        ]);

        const posVel = Array.from(world.query(Position, Velocity))
            .map(r => ({ id: r.e.id, p: r.c1, v: r.c2 }));

        expect(posVel).toEqual([
            { id: e1.id, p: { x: 1, y: 1 }, v: { dx: 10, dy: 0 } },
        ]);
    });

    test("returns components in the same order as ctor arguments (2 components)", () => {
        // Isolate module state so TypeRegistry's global TypeId counter resets for this test.
        jest.isolateModules(() => {
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
            class A { constructor(public v = "a") {} }
            class B { constructor(public v = "b") {} }
            class C { constructor(public v = "c") {} }

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
        const e1 = world.spawn();
        world.add(e1, Position, new Position(1, 1));

        const iter = world.query(Position)[Symbol.iterator]();
        const first = iter.next();
        expect(first.done).toBe(false);

        expect(() => world.add(e1, Velocity, new Velocity(1, 1))).toThrow(/Cannot do structural change/i);
        expect(() => world.remove(e1, Position)).toThrow(/Cannot do structural change/i);
        expect(() => world.despawn(e1)).toThrow(/Cannot do structural change/i);

        // exhausting iterator should clear the flag (finally)
        while (!iter.next().done) {
            // intentionally empty - exhausting iterator
        }

        // now should work
        expect(() => world.add(e1, Velocity, new Velocity(1, 1))).not.toThrow();
    });

    // ---------------------------------------------------------------------
    // queryTables()
    // ---------------------------------------------------------------------

    it("queryTables yields one item per matching archetype (table), not per entity", () => {
        const w = new World();

        // Archetype A: [Position]
        const e1 = w.spawn();
        const e2 = w.spawn();
        w.add(e1, Position, new Position(1, 1));
        w.add(e2, Position, new Position(2, 2));

        // Archetype B: [Position, Velocity]
        const e3 = w.spawn();
        w.add(e3, Position, new Position(3, 3));
        w.add(e3, Velocity, new Velocity(30, 0));

        const tables = Array.from(w.queryTables(Position));

        // Should match both archetypes that contain Position
        expect(tables.length).toBe(2);

        // Each table has SoA columns aligned by row index with entities[]
        const counts = tables.map(t => t.entities.length).sort((a, b) => a - b);
        expect(counts).toEqual([1, 2]);

        for (const t of tables) {
            expect(t.entities.length).toBe(t.c1.length);
        }

        // Ensure the table containing e3 has Position(3,3)
        const tWithE3 = tables.find(t => t.entities.some(e => e.id === e3.id))!;
        const idx3 = tWithE3.entities.findIndex(e => e.id === e3.id);
        expect(tWithE3.c1[idx3]).toMatchObject({ x: 3, y: 3 });

        // Ensure the Position-only table has two rows with expected values
        const tPosOnly = tables.find(t => t.entities.length === 2)!;
        const gotPosOnly = tPosOnly.entities
            .map((e, i) => ({ id: e.id, p: tPosOnly.c1[i] }))
            .sort((a, b) => a.id - b.id);
        expect(gotPosOnly).toEqual([
            { id: e1.id, p: { x: 1, y: 1 } },
            { id: e2.id, p: { x: 2, y: 2 } },
        ]);
    });

    test("queryTables returns columns in the same order as ctor arguments (2 components)", () => {
        jest.isolateModules(() => {
            const e = world.spawn();

            // Register Velocity first so TypeIds are likely not in requested order.
            const vel = new Velocity(9, 8);
            const pos = new Position(7, 6);
            world.add(e, Velocity, vel);
            world.add(e, Position, pos);

            const tables: any[] = Array.from(world.queryTables(Position, Velocity));
            expect(tables).toHaveLength(1);

            const t = tables[0];
            expect(t.entities).toHaveLength(1);

            // queryTables(Position, Velocity) -> { entities, c1: Position[], c2: Velocity[] }
            expect(t.entities[0]).toBe(e);
            expect(t.c1[0]).toBe(pos);
            expect(t.c2[0]).toBe(vel);
        });
    });

    it("prevents structural changes during queryTables iteration", () => {
        const w = new World();
        const e1 = w.spawn();
        w.add(e1, Position, new Position(1, 1));

        const iter = w.queryTables(Position)[Symbol.iterator]();
        const first = iter.next();
        expect(first.done).toBe(false);

        expect(() => w.add(e1, Velocity, new Velocity(1, 1))).toThrow(/Cannot do structural change/i);
        expect(() => w.remove(e1, Position)).toThrow(/Cannot do structural change/i);
        expect(() => w.despawn(e1)).toThrow(/Cannot do structural change/i);

        // exhausting iterator should clear the flag (finally)
        while (!iter.next().done) {
            // intentionally empty - exhausting iterator
        }

        expect(() => w.add(e1, Velocity, new Velocity(1, 1))).not.toThrow();
    });

    // ---------------------------------------------------------------------
    // queryEach()
    // ---------------------------------------------------------------------

    it("queryEach calls fn for each matching entity row (no yielded objects)", () => {
        const e1 = world.spawn();
        const e2 = world.spawn();
        const e3 = world.spawn();

        world.add(e1, Position, new Position(1, 1));
        world.add(e1, Velocity, new Velocity(10, 0));

        world.add(e2, Position, new Position(2, 2));

        world.add(e3, Velocity, new Velocity(0, 20));

        const got: { id: number; p: Position }[] = [];
        world.queryEach(Position, (e, p) => got.push({ id: e.id, p }));

        got.sort((a, b) => a.id - b.id);
        expect(got).toEqual([
            { id: e1.id, p: { x: 1, y: 1 } },
            { id: e2.id, p: { x: 2, y: 2 } },
        ]);
    });

    test("queryEach passes components in the same order as ctor arguments (2 components)", () => {
        jest.isolateModules(() => {
            const e = world.spawn();

            // Register in different order than requested
            const vel = new Velocity(1, 2);
            const pos = new Position(3, 4);
            world.add(e, Velocity, vel);
            world.add(e, Position, pos);

            const calls: any[] = [];
            world.queryEach(Position, Velocity, (ent: any, c1: any, c2: any) => {
                calls.push({ ent, c1, c2 });
            });

            expect(calls).toHaveLength(1);
            expect(calls[0].ent).toBe(e);
            expect(calls[0].c1).toBe(pos);
            expect(calls[0].c2).toBe(vel);
        });
    });

    it("prevents structural changes inside queryEach callback", () => {
        const e1 = world.spawn();
        world.add(e1, Position, new Position(1, 1));

        expect(() => {
            world.queryEach(Position, () => {
                world.add(e1, Velocity, new Velocity(1, 1));
            });
        }).toThrow(/Cannot do structural change/i);

        // After queryEach finishes (even via throw), iteration depth should be restored.
        expect(() => world.add(e1, Velocity, new Velocity(2, 2))).not.toThrow();
    });
});