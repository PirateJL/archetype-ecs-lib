import { World, Schedule } from '../src';

describe("Lifecycle Runtime Warnings", () => {
    test("throws error when World.update() is used after Schedule.run()", () => {
        const world = new World();
        const schedule = new Schedule();

        // Use Schedule first
        schedule.run(world, 0.016, ['update']);

        // Then use World.update - should throw error
        expect(() => world.update(0.016)).toThrow(
            expect.objectContaining({
                message: expect.stringContaining("ECS Lifecycle Conflict Detected!")
            })
        );
    });

    test("throws error when Schedule.run() is used after World.update()", () => {
        const world = new World();
        const schedule = new Schedule();

        // Use World.update first
        world.update(0.016);

        // Then use Schedule - should throw error
        expect(() => schedule.run(world, 0.016, ['update'])).toThrow(
            expect.objectContaining({
                message: expect.stringContaining("ECS Lifecycle Conflict Detected!")
            })
        );
    });

    test("throws error every time when mixing lifecycle methods", () => {
        const world = new World();
        const schedule = new Schedule();

        // Use World.update first
        world.update(0.016);

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

    test("error message contains both method names", () => {
        const world = new World();
        const schedule = new Schedule();

        world.update(0.016);

        expect(() => schedule.run(world, 0.016, ['update'])).toThrow(
            /You are using both Schedule.run and World.update on the same World instance./i
        );
    });
});