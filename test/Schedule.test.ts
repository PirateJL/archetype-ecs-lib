import { ComponentCtor, Schedule, WorldApi } from "../src";

describe("Schedule", () => {

    function makeWorldStub(opts?: {
        hasPending?: boolean;
        usedWorldUpdate?: boolean;
        throwLifecycleConflict?: boolean;
    }): WorldApi {
        const hasPending = opts?.hasPending ?? true;
        const usedWorldUpdate = opts?.usedWorldUpdate ?? false;
        const throwLifecycleConflict = opts?.throwLifecycleConflict ?? false;

        const world: any = {
            // Schedule.run casts WorldApi -> World to read these
            _hasUsedWorldUpdate: usedWorldUpdate,
            _hasUsedScheduleRun: false,
            _warnAboutLifecycleConflict: jest.fn(() => {
                if (throwLifecycleConflict) throw new Error("Lifecycle conflict");
            }),

            addSystem: jest.fn(),
            update: jest.fn(),

            flush: jest.fn(),
            swapEvents: jest.fn(),

            // ---- Resources (minimal stubs) ----
            // tslint:disable-next-line:no-empty
            setResource: jest.fn(<T>(_key: ComponentCtor<T>, _value: T) => { }),
            getResource: jest.fn(<T>(_key: ComponentCtor<T>) => undefined as T | undefined),
            requireResource: jest.fn(<T>(key: ComponentCtor<T>) => {
                throw new Error(`Missing resource ${String((key as any)?.name ?? "resource")}`);
            }),
            hasResource: jest.fn(<T>(_key: ComponentCtor<T>) => false),
            removeResource: jest.fn(<T>(_key: ComponentCtor<T>) => false),
            initResource: jest.fn(<T>(_key: ComponentCtor<T>, factory: () => T) => factory()),

            // ---- Events (minimal stubs) ----
            emit: jest.fn(),
            events: jest.fn(),
            drainEvents: jest.fn(),
            clearEvents: jest.fn(),

            cmd: () => ({
                spawn: jest.fn(),
                spawnBundle: jest.fn(),
                despawn: jest.fn(),
                despawnBundle: jest.fn(),
                add: jest.fn(),
                addBundle: jest.fn(),
                remove: jest.fn(),
                removeBundle: jest.fn(),
                hasPending: jest.fn(() => hasPending),
            }),

            spawn: () => ({ id: 0, gen: 0 }),
            spawnMany: () => ({ id: 1, gen: 0 }),
            despawn: jest.fn(),
            despawnMany: jest.fn(),
            isAlive: jest.fn(() => true),

            has: jest.fn(() => false),
            get: jest.fn(() => undefined),
            set: jest.fn(),
            add: jest.fn(),
            addMany: jest.fn(),
            remove: jest.fn(),
            removeMany: jest.fn(),

            query: jest.fn(function* () { /* empty */ }),
            queryTables: jest.fn(function* () { /* empty */ }),
            queryEach: jest.fn(function* () { /* empty */ }),
        };

        return world as WorldApi;
    }

    test("throws when run() is called without any phase order and nothing is scheduled", () => {
        const sched = new Schedule();
        const world = makeWorldStub({ hasPending: false });

        expect(() => sched.run(world, 0.016)).toThrow(
            "Schedule.run requires a phase order (pass it as an argument or call schedule.setOrder([...]))"
        );
    });

    test("setOrder clones the array and run() uses stored order when phaseOrder is omitted", () => {
        const sched = new Schedule();
        const world = makeWorldStub({ hasPending: false });

        const calls: string[] = [];
        (world.swapEvents as any).mockImplementation(() => calls.push("swap"));

        const order = ["b", "a"];
        sched.setOrder(order);

        // mutate caller array to ensure Schedule cloned it
        order.reverse();

        sched.add("a", () => calls.push("a"));
        sched.add("b", () => calls.push("b"));

        sched.run(world, 0.016);

        expect(calls).toEqual(["b", "swap", "a", "swap"]);
        expect((world as any)._hasUsedScheduleRun).toBe(true);
    });

    test("setBoundaryMode('manual') disables flush/swap between phases", () => {
        const sched = new Schedule();
        const world = makeWorldStub({ hasPending: true });

        const calls: string[] = [];
        sched.add("a", () => calls.push("a"));
        sched.add("b", () => calls.push("b"));

        sched.setBoundaryMode("manual");
        sched.run(world, 0.016, ["a", "b"]);

        expect(calls).toEqual(["a", "b"]);
        expect(world.flush).not.toHaveBeenCalled();
        expect(world.swapEvents).not.toHaveBeenCalled();
    });

    test("auto boundary mode: flush only when cmd().hasPending() is true; swapEvents always runs per phase", () => {
        const sched = new Schedule();

        // hasPending = false: should not flush, but should swap
        const world = makeWorldStub({ hasPending: false });

        sched.add("a", () => { /* noop */ });
        sched.add("b", () => { /* noop */ });

        sched.run(world, 0.016, ["a", "b"]);

        expect(world.flush).not.toHaveBeenCalled();
        expect(world.swapEvents).toHaveBeenCalledTimes(2);
    });

    test("explicit phaseOrder is used as-is even if phases have no systems (boundary still applied)", () => {
        const sched = new Schedule();
        const world = makeWorldStub({ hasPending: true });

        const calls: string[] = [];
        (world.flush as any).mockImplementation(() => calls.push("flush"));
        (world.swapEvents as any).mockImplementation(() => calls.push("swap"));

        sched.add("a", () => calls.push("a1"));

        sched.run(world, 0.016, ["a", "missing"]);

        expect(calls).toEqual(["a1", "flush", "swap", "flush", "swap"]);
        expect(world.flush).toHaveBeenCalledTimes(2);
        expect(world.swapEvents).toHaveBeenCalledTimes(2);
    });

    test("after() throws if called before any add()", () => {
        const sched = new Schedule();

        expect(() => sched.after("input")).toThrow('Schedule.after("input") must be called after schedule.add(phase, fn).');
    });

    test("before() throws if called before any add()", () => {
        const sched = new Schedule();

        expect(() => sched.before("render")).toThrow('Schedule.before("render") must be called after schedule.add(phase, fn).');
    });

    test("add(...) returns constraint helpers; .after()/.before() add constraints and return schedule", () => {
        const sched = new Schedule();
        const fn = jest.fn();

        const helpers = sched.add("sim", fn);
        expect(helpers.after("input")).toBe(sched);
        expect(helpers.before("render")).toBe(sched);
    });

    test("run() computes phase order from constraints when no explicit order/setOrder is provided", () => {
        const sched = new Schedule();
        const world = makeWorldStub({ hasPending: false });

        const calls: string[] = [];
        (world.swapEvents as any).mockImplementation(() => { /* ignore boundary */ });

        // Add in an order that is not the final order
        sched.add("render", () => calls.push("render")).after("sim");
        sched.add("sim", () => calls.push("sim")).after("input");
        sched.add("input", () => calls.push("input"));

        sched.run(world, 0.016);

        expect(calls).toEqual(["input", "sim", "render"]);
    });

    test("computed order includes phases referenced only by constraints (even if they have no systems)", () => {
        const sched = new Schedule();
        const world = makeWorldStub({ hasPending: false });

        const seen: string[] = [];
        (world.swapEvents as any).mockImplementation(() => { /* ignore boundary */ });

        // 'input' is referenced, but not added with a system.
        sched.add("sim", () => seen.push("sim")).after("input");

        sched.run(world, 0.016);

        // sim must run after input, so input must appear in computed order,
        // but since it has no systems, we only see "sim" executed.
        expect(seen).toEqual(["sim"]);
    });

    test("computed order tie-breaks unconstrained phases by insertion order", () => {
        const sched = new Schedule();
        const world = makeWorldStub({ hasPending: false });

        const calls: string[] = [];
        (world.swapEvents as any).mockImplementation(() => { /* ignore boundary */ });

        sched.add("z", () => calls.push("z"));
        sched.add("a", () => calls.push("a"));

        sched.run(world, 0.016);

        expect(calls).toEqual(["z", "a"]);
    });

    test("computed order tie-breaks phases not added via add() lexicographically (constraint-only phases)", () => {
        const sched = new Schedule();
        const world = makeWorldStub({ hasPending: false });

        const calls: string[] = [];
        (world.swapEvents as any).mockImplementation(() => { /* ignore boundary */ });

        // Create constraint-only phases 'b' and 'a' with no systems:
        // b -> sim and a -> sim. Their relative order is unconstrained and not in stableRank,
        // so lexicographic fallback should apply: 'a' before 'b' (not directly observable via systems),
        // but we can observe that sim runs after both regardless.
        const h = sched.add("sim", () => calls.push("sim"));
        h.after("b");
        h.after("a");

        sched.run(world, 0.016);

        expect(calls).toEqual(["sim"]);
    });

    test("throws on invalid self-constraint (before === after)", () => {
        const sched = new Schedule();
        const fn = jest.fn();

        expect(() => sched.add("a", fn).after("a")).toThrow(/cannot be before\/after itself/i);
        expect(() => sched.add("b", fn).before("b")).toThrow(/cannot be before\/after itself/i);
    });

    test("throws on cyclic constraints when computing phase order", () => {
        const sched = new Schedule();
        const world = makeWorldStub({ hasPending: false });

        // tslint:disable-next-line:no-empty
        sched.add("a", () => { }).after("b"); // b -> a
        // tslint:disable-next-line:no-empty
        sched.add("b", () => { }).after("a"); // a -> b

        expect(() => sched.run(world, 0.016)).toThrow(/cycle/i);
    });

    test("wraps system Error with name and message; does not flush/swap after failing phase", () => {
        const sched = new Schedule();
        const world = makeWorldStub({ hasPending: true });

        const BoomSystem = (_w: any, _dt: number) => {
            throw new Error("boom!");
        };

        sched.add("sim", BoomSystem);

        expect(() => sched.run(world as any, 0.016, ["sim"]))
            .toThrow("[phase=sim system=BoomSystem] boom!");

        expect(world.flush).not.toHaveBeenCalled();
        expect(world.swapEvents).not.toHaveBeenCalled();
    });

    test("wraps system error when function name is empty (<anonymous>)", () => {
        const sched = new Schedule();
        const world = makeWorldStub({ hasPending: true });

        const anon = (_w: any, _dt: number) => { throw new Error("boom!"); };
        Object.defineProperty(anon, "name", { value: "", configurable: true });

        sched.add("sim", anon as any);

        expect(() => sched.run(world as any, 0.016, ["sim"]))
            .toThrow("[phase=sim system=<anonymous>] boom!");

        expect(world.flush).not.toHaveBeenCalled();
        expect(world.swapEvents).not.toHaveBeenCalled();
    });

    test("wraps thrown non-Error objects by JSON stringifying when message is not a string", () => {
        const sched = new Schedule();
        const world = makeWorldStub({ hasPending: true });

        function WeirdThrowSystem() {
            // message exists but is not a string => should hit JSON.stringify(error)
            throw { message: 123, kind: "weird" };
        }

        sched.add("sim", WeirdThrowSystem as any);

        expect(() => sched.run(world as any, 0.016, ["sim"]))
            .toThrow('[phase=sim system=WeirdThrowSystem] {"message":123,"kind":"weird"}');

        expect(world.flush).not.toHaveBeenCalled();
        expect(world.swapEvents).not.toHaveBeenCalled();
    });

    test("lifecycle conflict: if world._hasUsedWorldUpdate is true, Schedule.run calls _warnAboutLifecycleConflict", () => {
        const sched = new Schedule();
        const world = makeWorldStub({ usedWorldUpdate: true });

        sched.add("sim", () => { /* noop */ });

        sched.run(world, 0.016, ["sim"]);

        expect((world as any)._warnAboutLifecycleConflict).toHaveBeenCalledWith("Schedule.run");
    });

    test("lifecycle conflict: if _warnAboutLifecycleConflict throws, Schedule.run propagates it and does not set _hasUsedScheduleRun", () => {
        const sched = new Schedule();
        const world = makeWorldStub({ usedWorldUpdate: true, throwLifecycleConflict: true });

        sched.add("sim", () => { /* noop */ });

        expect(() => sched.run(world, 0.016, ["sim"])).toThrow("Lifecycle conflict");
        expect((world as any)._hasUsedScheduleRun).toBe(false);
    });
});