import { World } from "../src";
import { Position } from "./Mocks/Position.mock";
import { Velocity } from "./Mocks/Velocity.mock";

describe("World Stats", () => {
    let world: World;

    beforeEach(() => {
        world = new World();
    });

    describe("stats()", () => {
        it("returns initial stats for empty world", () => {
            const stats = world.stats();

            expect(stats.aliveEntities).toBe(0);
            expect(stats.archetypes).toBe(1);
            expect(stats.rows).toBe(0);
            expect(stats.systems).toBe(0);
            expect(stats.resources).toBe(0);
            expect(stats.eventChannels).toBe(0);
            expect(stats.pendingCommands).toBe(false);
            expect(stats.frame).toBe(0);
            expect(stats.dt).toBe(0);
            expect(stats.frameMs).toBe(0);
            expect(stats.phaseMs).toEqual({});
            expect(stats.systemMs).toEqual({});
        });

        it("counts alive entities correctly", () => {
            const e1 = world.spawn();
            const e2 = world.spawn();
            const e3 = world.spawn();

            expect(world.stats().aliveEntities).toBe(3);

            world.despawn(e2);
            expect(world.stats().aliveEntities).toBe(2);

            world.despawn(e1);
            world.despawn(e3);
            expect(world.stats().aliveEntities).toBe(0);
        });

        it("counts archetypes correctly", () => {
            expect(world.stats().archetypes).toBe(1);

            const e1 = world.spawn();
            world.add(e1, Position, new Position());
            expect(world.stats().archetypes).toBe(2);

            const e2 = world.spawn();
            world.add(e2, Position, new Position());
            world.add(e2, Velocity, new Velocity());
            expect(world.stats().archetypes).toBe(3);
        });

        it("counts rows (total component instances) correctly", () => {
            const e1 = world.spawn();
            world.add(e1, Position, new Position());
            expect(world.stats().rows).toBe(1);

            const e2 = world.spawn();
            world.add(e2, Position, new Position());
            expect(world.stats().rows).toBe(2);
        });

        it("counts systems correctly", () => {
            expect(world.stats().systems).toBe(0);

            world.addSystem(() => {});
            expect(world.stats().systems).toBe(1);

            world.addSystem(() => {});
            world.addSystem(() => {});
            expect(world.stats().systems).toBe(3);
        });

        it("counts resources correctly", () => {
            expect(world.stats().resources).toBe(0);

            world.setResource(Position, new Position(1, 2));
            expect(world.stats().resources).toBe(1);

            world.setResource(Velocity, new Velocity(3, 4));
            expect(world.stats().resources).toBe(2);
        });

        it("detects pending commands", () => {
            expect(world.stats().pendingCommands).toBe(false);

            world.cmd().spawn();
            expect(world.stats().pendingCommands).toBe(true);

            world.flush();
            expect(world.stats().pendingCommands).toBe(false);
        });

        it("increments frame counter after update", () => {
            expect(world.stats().frame).toBe(0);

            world.update(0.016);
            expect(world.stats().frame).toBe(1);

            world.update(0.016);
            world.update(0.016);
            expect(world.stats().frame).toBe(3);
        });

        it("records dt from last update", () => {
            world.update(0.016);
            expect(world.stats().dt).toBeCloseTo(0.016, 5);

            world.update(0.033);
            expect(world.stats().dt).toBeCloseTo(0.033, 5);
        });

        it("records frameMs timing", () => {
            world.addSystem(() => {
                // Simulate some work
                let sum = 0;
                for (let i = 0; i < 1000; i++) sum += i;
            });

            world.update(0.016);
            expect(world.stats().frameMs).toBeGreaterThanOrEqual(0);
        });
    });

    describe("statsHistory()", () => {
        it("returns empty history initially", () => {
            const history = world.statsHistory();

            expect(history.capacity).toBeGreaterThan(0);
            expect(history.size).toBe(0);
            expect(history.dt).toEqual([]);
            expect(history.frameMs).toEqual([]);
        });

        it("accumulates history after updates", () => {
            world.update(0.016);
            world.update(0.017);
            world.update(0.015);

            const history = world.statsHistory();
            expect(history.size).toBe(3);
            expect(history.dt.length).toBe(3);
            expect(history.frameMs.length).toBe(3);
        });

        it("respects history capacity (ring buffer)", () => {
            world.setProfilingHistorySize(5);

            for (let i = 0; i < 10; i++) {
                world.update(0.001 * (i + 1));
            }

            const history = world.statsHistory();
            expect(history.size).toBe(5);
            expect(history.capacity).toBe(5);
        });

        it("can change history size via setProfilingHistorySize", () => {
            world.setProfilingHistorySize(50);

            for (let i = 0; i < 100; i++) {
                world.update(0.016);
            }

            expect(world.statsHistory().size).toBe(50);
        });
    });

    describe("profiling toggle", () => {
        it("can enable/disable profiling", () => {
            world.setProfilingEnabled(true);
            world.addSystem(() => {});
            world.update(0.016);

            // Should have timing data when enabled
            const statsEnabled = world.stats();
            expect(statsEnabled.frameMs).toBeGreaterThanOrEqual(0);

            world.setProfilingEnabled(false);
            world.update(0.016);

            // Stats still work but timing may be zeroed
            const statsDisabled = world.stats();
            expect(statsDisabled.frame).toBe(2);
        });
    });
});
