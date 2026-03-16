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

    it("_iterateDepth is restored when query loop is broken early", () => {
        const e1 = world.spawn();
        world.add(e1, Position, new Position(1, 1));

        // for..of break internally calls iterator.return(), which triggers the finally block
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for (const _ of world.query(Position)) { break; }

        expect(() => world.spawn()).not.toThrow();
    });

    it("_iterateDepth is restored when queryTables loop is broken early", () => {
        const e1 = world.spawn();
        world.add(e1, Position, new Position(1, 1));

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for (const _ of world.queryTables(Position)) { break; }

        expect(() => world.spawn()).not.toThrow();
    });

    class Health { constructor(public hp = 100) {} }
    class C4 { constructor(public v = 4) {} }
    class C5 { constructor(public v = 5) {} }
    class C6 { constructor(public v = 6) {} }

    test("query with 4 components yields correct row shape", () => {
        const w = new World();
        const e = w.spawnMany(
            [Position, new Position(1, 2)],
            [Velocity, new Velocity(3, 4)],
            [Health, new Health(100)],
            [C4, new C4(44)],
        );
        const rows = Array.from(w.query(Position, Velocity, Health, C4));
        expect(rows).toHaveLength(1);
        expect(rows[0]!.e).toEqual(e);
        expect(rows[0]!.c4.v).toBe(44);
    });

    test("query with 5 components yields correct row shape", () => {
        const w = new World();
        const e = w.spawnMany(
            [Position, new Position(1, 2)],
            [Velocity, new Velocity(3, 4)],
            [Health, new Health(100)],
            [C4, new C4(44)],
            [C5, new C5(55)],
        );
        const rows = Array.from(w.query(Position, Velocity, Health, C4, C5));
        expect(rows).toHaveLength(1);
        expect(rows[0]!.e).toEqual(e);
        expect(rows[0]!.c5.v).toBe(55);
    });

    test("query with 6 components yields correct row shape", () => {
        const w = new World();
        const e = w.spawnMany(
            [Position, new Position(1, 2)],
            [Velocity, new Velocity(3, 4)],
            [Health, new Health(100)],
            [C4, new C4(44)],
            [C5, new C5(55)],
            [C6, new C6(66)],
        );
        const rows = Array.from(w.query(Position, Velocity, Health, C4, C5, C6));
        expect(rows).toHaveLength(1);
        expect(rows[0]!.e).toEqual(e);
        expect(rows[0]!.c6.v).toBe(66);
    });

    test("queryEach with 3 components calls fn with correct args", () => {
        const w = new World();
        w.spawnMany(
            [Position, new Position(1, 2)],
            [Velocity, new Velocity(3, 4)],
            [Health, new Health(77)],
        );
        const results: number[] = [];
        w.queryEach(Position, Velocity, Health, (_e, _p, _v, h) => results.push(h.hp));
        expect(results).toEqual([77]);
    });

    test("queryEach with 4 components calls fn with correct args", () => {
        const w = new World();
        w.spawnMany(
            [Position, new Position(1, 2)],
            [Velocity, new Velocity(3, 4)],
            [Health, new Health(10)],
            [C4, new C4(44)],
        );
        const results: number[] = [];
        w.queryEach(Position, Velocity, Health, C4, (_e, _p, _v, _h, c4) => results.push(c4.v));
        expect(results).toEqual([44]);
    });

    test("queryEach with 5 components calls fn with correct args", () => {
        const w = new World();
        w.spawnMany(
            [Position, new Position(1, 2)],
            [Velocity, new Velocity(3, 4)],
            [Health, new Health(10)],
            [C4, new C4(44)],
            [C5, new C5(55)],
        );
        const results: number[] = [];
        w.queryEach(Position, Velocity, Health, C4, C5, (_e, _p, _v, _h, _c4, c5) => results.push(c5.v));
        expect(results).toEqual([55]);
    });

    test("queryEach with 6 components calls fn with correct args", () => {
        const w = new World();
        w.spawnMany(
            [Position, new Position(1, 2)],
            [Velocity, new Velocity(3, 4)],
            [Health, new Health(10)],
            [C4, new C4(44)],
            [C5, new C5(55)],
            [C6, new C6(66)],
        );
        const results: number[] = [];
        w.queryEach(Position, Velocity, Health, C4, C5, C6, (_e, _p, _v, _h, _c4, _c5, c6) => results.push(c6.v));
        expect(results).toEqual([66]);
    });

    class C7 { constructor(public v = 7) {} }

    test("query with 7+ components uses the default switch branch", () => {
        const w = new World();
        w.spawnMany(
            [Position, new Position(1, 2)],
            [Velocity, new Velocity(3, 4)],
            [Health, new Health(10)],
            [C4, new C4(44)],
            [C5, new C5(55)],
            [C6, new C6(66)],
            [C7, new C7(77)],
        );
        const rows: any[] = Array.from((w.query as any)(Position, Velocity, Health, C4, C5, C6, C7));
        expect(rows).toHaveLength(1);
        expect(rows[0].c7.v).toBe(77);
    });

    test("queryEach with 7+ components uses the default switch branch", () => {
        const w = new World();
        w.spawnMany(
            [Position, new Position(1, 2)],
            [Velocity, new Velocity(3, 4)],
            [Health, new Health(10)],
            [C4, new C4(44)],
            [C5, new C5(55)],
            [C6, new C6(66)],
            [C7, new C7(77)],
        );
        const results: number[] = [];
        (w.queryEach as any)(Position, Velocity, Health, C4, C5, C6, C7, (_e: any, _p: any, _v: any, _h: any, _c4: any, _c5: any, _c6: any, c7: any) => results.push(c7.v));
        expect(results).toEqual([77]);
    });
});