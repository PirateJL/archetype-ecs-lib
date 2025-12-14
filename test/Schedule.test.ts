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
});
