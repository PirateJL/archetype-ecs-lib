import { World, Schedule } from '../src';

describe("Lifecycle Runtime Warnings", () => {
    test("throws error when World.update() is called with systems registered via schedule.add()", () => {
        const world = new World();
        const schedule = new Schedule();

        // Register a system via Schedule (populates _scheduleSystems)
        schedule.add(world, "update", () => { /* noop */ });

        // Then use World.update - should throw because _scheduleSystems.size > 0
        expect(() => world.update(0.016)).toThrow(
            expect.objectContaining({
                message: expect.stringContaining("ECS Lifecycle Conflict Detected!")
            })
        );
    });

    test("throws error when Schedule.run() is called with systems registered via world.addSystem()", () => {
        const world = new World();
        const schedule = new Schedule();

        // Register a system via World.addSystem (populates systems array)
        world.addSystem(() => { /* noop */ });

        // Then use Schedule.run - should throw because _getSystemCount() > 0
        expect(() => schedule.run(world, 0.016, ['update'])).toThrow(
            expect.objectContaining({
                message: expect.stringContaining("ECS Lifecycle Conflict Detected!")
            })
        );
    });

    test("throws error every time when Schedule.run() called with addSystem() systems", () => {
        const world = new World();
        const schedule = new Schedule();

        // Register a system via World.addSystem
        world.addSystem(() => { /* noop */ });

        // Every subsequent Schedule.run should throw
        expect(() => schedule.run(world, 0.016, ['update'])).toThrow();
        expect(() => schedule.run(world, 0.016, ['render'])).toThrow();
    });

    test("does not throw when using only World.update()", () => {
        const world = new World();

        expect(() => {
            world.update(0.016);
            world.update(0.016);
            world.update(0.016);
        }).not.toThrow();
    });

    test("does not throw when using only Schedule.run()", () => {
        const world = new World();
        const schedule = new Schedule();

        expect(() => {
            schedule.run(world, 0.016, ['update']);
            schedule.run(world, 0.016, ['render']);
        }).not.toThrow();
    });

    test("error message mentions both lifecycle approaches in recommended fix", () => {
        const world = new World();
        const schedule = new Schedule();

        // Register a system via World.addSystem to trigger conflict
        world.addSystem(() => { /* noop */ });

        expect(() => schedule.run(world, 0.016, ['update'])).toThrow(
            /World\.update\(\)[\s\S]*Schedule\.run\(\)/
        );
    });
});