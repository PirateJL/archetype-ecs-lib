import { World } from "../src";
import { Position } from "./Mocks/Position.mock";
import { Velocity } from "./Mocks/Velocity.mock";

class Dead { }
class Frozen { }
class Active { }

describe("QueryFilter", () => {
    let world: World;

    beforeEach(() => {
        world = new World();
    });

    // -------------------------------------------------------------------------
    // without filter
    // -------------------------------------------------------------------------

    describe("without filter", () => {
        it("query: excludes entities that have the excluded component", () => {
            const alive = world.spawn();
            world.add(alive, Position, new Position(1, 1));

            const dead = world.spawn();
            world.add(dead, Position, new Position(2, 2));
            world.add(dead, Dead, new Dead());

            const result = Array.from(world.query(Position, { without: [Dead] }));

            expect(result).toHaveLength(1);
            expect(result[0]!.e.id).toBe(alive.id);
        });

        it("query: returns all when no entity has the excluded component", () => {
            const e1 = world.spawn();
            world.add(e1, Position, new Position(1, 1));
            const e2 = world.spawn();
            world.add(e2, Position, new Position(2, 2));

            const result = Array.from(world.query(Position, { without: [Dead] }));

            expect(result).toHaveLength(2);
        });

        it("query: returns nothing when all entities have the excluded component", () => {
            const e1 = world.spawn();
            world.add(e1, Position, new Position(1, 1));
            world.add(e1, Dead, new Dead());

            const result = Array.from(world.query(Position, { without: [Dead] }));

            expect(result).toHaveLength(0);
        });

        it("query: supports multiple excluded components", () => {
            const normal = world.spawn();
            world.add(normal, Position, new Position(1, 1));

            const dead = world.spawn();
            world.add(dead, Position, new Position(2, 2));
            world.add(dead, Dead, new Dead());

            const frozen = world.spawn();
            world.add(frozen, Position, new Position(3, 3));
            world.add(frozen, Frozen, new Frozen());

            const result = Array.from(world.query(Position, { without: [Dead, Frozen] }));

            expect(result).toHaveLength(1);
            expect(result[0]!.e.id).toBe(normal.id);
        });

        it("queryTables: excludes archetypes that have the excluded component", () => {
            const alive = world.spawn();
            world.add(alive, Position, new Position(1, 1));

            const dead = world.spawn();
            world.add(dead, Position, new Position(2, 2));
            world.add(dead, Dead, new Dead());

            const tables = Array.from(world.queryTables(Position, { without: [Dead] }));

            expect(tables).toHaveLength(1);
            expect(tables[0]!.entities).toHaveLength(1);
            expect(tables[0]!.entities[0]!.id).toBe(alive.id);
        });

        it("queryEach: skips entities that have the excluded component", () => {
            const alive = world.spawn();
            world.add(alive, Position, new Position(1, 1));

            const dead = world.spawn();
            world.add(dead, Position, new Position(2, 2));
            world.add(dead, Dead, new Dead());

            const visited: number[] = [];
            world.queryEach(Position, { without: [Dead] }, (e) => {
                visited.push(e.id);
            });

            expect(visited).toEqual([alive.id]);
        });

        it("queryEach: works with multiple components and a filter", () => {
            const moving = world.spawn();
            world.add(moving, Position, new Position(1, 1));
            world.add(moving, Velocity, new Velocity(10, 0));

            const deadMoving = world.spawn();
            world.add(deadMoving, Position, new Position(2, 2));
            world.add(deadMoving, Velocity, new Velocity(5, 0));
            world.add(deadMoving, Dead, new Dead());

            const visited: number[] = [];
            world.queryEach(Position, Velocity, { without: [Dead] }, (e) => {
                visited.push(e.id);
            });

            expect(visited).toEqual([moving.id]);
        });
    });

    // -------------------------------------------------------------------------
    // with filter (presence without value)
    // -------------------------------------------------------------------------

    describe("with filter", () => {
        it("query: only matches entities that also have the with component", () => {
            const active = world.spawn();
            world.add(active, Position, new Position(1, 1));
            world.add(active, Active, new Active());

            const inactive = world.spawn();
            world.add(inactive, Position, new Position(2, 2));

            const result = Array.from(world.query(Position, { with: [Active] }));

            expect(result).toHaveLength(1);
            expect(result[0]!.e.id).toBe(active.id);
            // The 'with' component is not in the result row
            expect((result[0] as any).c2).toBeUndefined();
        });

        it("queryTables: only returns archetypes that include the with component", () => {
            const active = world.spawn();
            world.add(active, Position, new Position(1, 1));
            world.add(active, Active, new Active());

            const inactive = world.spawn();
            world.add(inactive, Position, new Position(2, 2));

            const tables = Array.from(world.queryTables(Position, { with: [Active] }));

            expect(tables).toHaveLength(1);
            expect(tables[0]!.entities[0]!.id).toBe(active.id);
        });

        it("queryEach: only visits entities that have the with component", () => {
            const active = world.spawn();
            world.add(active, Position, new Position(1, 1));
            world.add(active, Active, new Active());

            const inactive = world.spawn();
            world.add(inactive, Position, new Position(2, 2));

            const visited: number[] = [];
            world.queryEach(Position, { with: [Active] }, (e) => {
                visited.push(e.id);
            });

            expect(visited).toEqual([active.id]);
        });
    });

    // -------------------------------------------------------------------------
    // combined with + without
    // -------------------------------------------------------------------------

    describe("combined with + without", () => {
        it("query: applies both filters simultaneously", () => {
            // active + alive -> should match
            const match = world.spawn();
            world.add(match, Position, new Position(1, 1));
            world.add(match, Active, new Active());

            // active + dead -> excluded by without
            const activeDead = world.spawn();
            world.add(activeDead, Position, new Position(2, 2));
            world.add(activeDead, Active, new Active());
            world.add(activeDead, Dead, new Dead());

            // not active -> excluded by with
            const inactive = world.spawn();
            world.add(inactive, Position, new Position(3, 3));

            const result = Array.from(world.query(Position, { with: [Active], without: [Dead] }));

            expect(result).toHaveLength(1);
            expect(result[0]!.e.id).toBe(match.id);
        });
    });

    // -------------------------------------------------------------------------
    // edge cases
    // -------------------------------------------------------------------------

    describe("edge cases", () => {
        it("query: no filter object behaves identically to before", () => {
            const e1 = world.spawn();
            world.add(e1, Position, new Position(5, 5));

            const result = Array.from(world.query(Position));

            expect(result).toHaveLength(1);
            expect(result[0]!.c1).toMatchObject({ x: 5, y: 5 });
        });

        it("query: empty without array has no effect", () => {
            const e1 = world.spawn();
            world.add(e1, Position, new Position(1, 1));

            const result = Array.from(world.query(Position, { without: [] }));

            expect(result).toHaveLength(1);
        });

        it("_iterateDepth is restored after filtered query breaks early", () => {
            const e1 = world.spawn();
            world.add(e1, Position, new Position(1, 1));

            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            for (const _ of world.query(Position, { without: [Dead] })) { break; }

            expect(() => world.spawn()).not.toThrow();
        });
    });
});
