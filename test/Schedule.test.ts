import { Schedule } from '../src/ecs/Schedule';

describe("Schedule", () => {
    test("runs systems by phase order and flushes between phases that exist", () => {
        const sched = new Schedule();

        const calls: string[] = [];
        const world = { flush: jest.fn(() => calls.push("flush")) };

        sched.add("a", (_w: any, _dt: number) => calls.push("a1"));
        sched.add("a", (_w: any, _dt: number) => calls.push("a2"));
        sched.add("b", (_w: any, _dt: number) => calls.push("b1"));

        sched.run(world, 0.016, ["a", "b", "c"]); // c has no systems

        expect(calls).toEqual(["a1", "a2", "flush", "b1", "flush"]);
        expect(world.flush).toHaveBeenCalledTimes(2);
    });

    test("add is chainable", () => {
        const sched = new Schedule();
        const fn = jest.fn();
        const out = sched.add("update", fn);
        expect(out).toBe(sched);
    });

    test("wraps system error", () => {
        const sched = new Schedule();
        const world = { flush: jest.fn() };

        const BoomSystem = (_w: any, _dt: number) => {
            throw new Error("boom!");
        }

        sched.add("sim", BoomSystem);

        expect(() => sched.run(world as any, 0.016, ["sim"])).toThrow("[phase=sim system=BoomSystem] boom!");

        // since the system exploded, we shouldn't have flushed after the phase
        expect(world.flush).not.toHaveBeenCalled();
    });

    test("wraps system custom error", () => {
        const sched = new Schedule();
        const world = { flush: jest.fn() };

        class CustomError
        {
            constructor(public message: string = 'something', public context = [])
            {
                this.message = 'CustomError: ' + this.message;
            }
        }

        const helloSystem = (_w: any, _dt: number) => {
            throw new CustomError("Hello mate!");
        }

        sched.add("greetings", helloSystem);

        expect(() => sched.run(world as any, 0.016, ["greetings"])).toThrow("[phase=greetings system=helloSystem] CustomError: Hello mate!");

        // since the system exploded, we shouldn't have flushed after the phase
        expect(world.flush).not.toHaveBeenCalled();
    });

    test("wraps system error with unknown function name", () => {
        const sched = new Schedule();
        const world = { flush: jest.fn() };

        sched.add("sim", (_w: any, _dt: number) => {
            throw new Error("boom!");
        });

        expect(() => sched.run(world as any, 0.016, ["sim"])).toThrow("[phase=sim system=<anonymous>] boom!");

        // since the system exploded, we shouldn't have flushed after the phase
        expect(world.flush).not.toHaveBeenCalled();
    });
});
