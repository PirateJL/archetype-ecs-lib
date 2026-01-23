import { World, Schedule } from '../src';

describe("Lifecycle Runtime Warnings", () => {
    let consoleWarnSpy: jest.SpyInstance;

    beforeEach(() => {
        consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    });

    afterEach(() => {
        consoleWarnSpy.mockRestore();
    });

    test("warns when World.update() is used after Schedule.run()", () => {
        const world = new World();
        const schedule = new Schedule();

        // Use Schedule first
        schedule.run(world, 0.016, ['update']);
        
        // Then use World.update - should trigger warning
        world.update(0.016);

        expect(consoleWarnSpy).toHaveBeenCalledWith(
            expect.stringContaining("ECS Lifecycle Conflict Detected!")
        );
        expect(consoleWarnSpy).toHaveBeenCalledWith(
            expect.stringContaining("You are using both World.update and Schedule.run")
        );
    });

    test("warns when Schedule.run() is used after World.update()", () => {
        const world = new World();
        const schedule = new Schedule();

        // Use World.update first
        world.update(0.016);
        
        // Then use Schedule - should trigger warning
        schedule.run(world, 0.016, ['update']);

        expect(consoleWarnSpy).toHaveBeenCalledWith(
            expect.stringContaining("ECS Lifecycle Conflict Detected!")
        );
    });

    test("only warns once per World instance", () => {
        const world = new World();
        const schedule = new Schedule();

        // Use both methods multiple times
        world.update(0.016);
        schedule.run(world, 0.016, ['update']);
        world.update(0.016); // Should not warn again
        schedule.run(world, 0.016, ['render']); // Should not warn again

        expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
    });

    test("does not warn when using only World.update()", () => {
        const world = new World();

        world.update(0.016);
        world.update(0.016);
        world.update(0.016);

        expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    test("does not warn when using only Schedule.run()", () => {
        const world = new World();
        const schedule = new Schedule();

        schedule.run(world, 0.016, ['update']);
        schedule.run(world, 0.016, ['render']);

        expect(consoleWarnSpy).not.toHaveBeenCalled();
    });
});