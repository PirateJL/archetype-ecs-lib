import { EventChannel, Schedule, World, WorldApi } from "../src";

describe("Events - EventChannel (double-buffered)", () => {
    test("emit writes to write buffer; becomes readable only after swap; drain clears read", () => {
        const ch = new EventChannel<number>();

        ch.emit(1);
        expect(ch.count()).toBe(0);
        expect(ch.values().length).toBe(0);

        ch.swapBuffers();
        expect(ch.count()).toBe(1);
        expect(ch.values()).toEqual([1]);

        const got: number[] = [];
        ch.drain((v) => got.push(v));
        expect(got).toEqual([1]);
        expect(ch.count()).toBe(0);
        expect(ch.values().length).toBe(0);
    });

    test("swap drops undrained read events (phase-to-phase delivery model)", () => {
        const ch = new EventChannel<string>();

        // Phase A emits "A"
        ch.emit("A");
        ch.swapBuffers(); // now readable: ["A"]
        expect(ch.values()).toEqual(["A"]);

        // If consumer forgets to drain in this phase, next swap should drop it
        ch.emit("B");     // produced in next phase
        ch.swapBuffers(); // now readable should be ["B"] only (A is dropped)
        expect(ch.values()).toEqual(["B"]);
    });

    test("order is preserved within a phase", () => {
        const ch = new EventChannel<number>();
        ch.emit(1);
        ch.emit(2);
        ch.emit(3);

        ch.swapBuffers();
        expect(ch.values()).toEqual([1, 2, 3]);
    });

    test("clear all", () => {
        const ch = new EventChannel<number>();
        ch.emit(1);
        ch.emit(2);
        ch.swapBuffers();
        ch.emit(3);

        ch.clearAll()

        expect(ch.count()).toBe(0);
    });
});

describe("Events - World API", () => {
    class TestEvent {
        constructor(public n: number) { }
    }

    test("emit -> not visible until swapEvents -> drainEvents consumes", () => {
        const w = new World();

        const got: number[] = [];

        w.emit(TestEvent, new TestEvent(7));

        // same phase: should not be visible yet
        w.drainEvents(TestEvent, (ev: TestEvent) => got.push(ev.n));
        expect(got).toEqual([]);

        // boundary: deliver to next phase
        w.swapEvents();

        // now visible
        w.drainEvents(TestEvent, (ev: TestEvent) => got.push(ev.n));
        expect(got).toEqual([7]);

        // drained -> empty
        w.drainEvents(TestEvent, (ev: TestEvent) => got.push(ev.n));
        expect(got).toEqual([7]);
    });

    test("clearEvents(type) clears readable buffer for that type", () => {
        const w = new World();

        w.emit(TestEvent, new TestEvent(1));
        w.swapEvents(); // now readable

        w.clearEvents(TestEvent);

        const got: number[] = [];
        w.drainEvents(TestEvent, (ev: TestEvent) => got.push(ev.n));
        expect(got).toEqual([]);
    });

    test("clearEvents() without args clears all readable buffers", () => {
        const w = new World();

        class E1 { constructor(public v: number) { } }
        class E2 { constructor(public v: number) { } }

        w.emit(E1, new E1(10));
        w.emit(E2, new E2(20));
        w.swapEvents(); // both readable

        w.clearEvents();

        const got1: number[] = [];
        const got2: number[] = [];
        w.drainEvents(E1, (e: E1) => got1.push(e.v));
        w.drainEvents(E2, (e: E2) => got2.push(e.v));

        expect(got1).toEqual([]);
        expect(got2).toEqual([]);
    });

    test("Get events()", () => {
        const w = new World();

        class E1 { constructor(public v: number) { } }
        class E2 { constructor(public v: number) { } }

        w.emit(E1, new E1(10));
        w.emit(E2, new E2(20));
        w.swapEvents(); // both readable

        expect(w.events(E2)).toEqual({"_read": [{"v": 20}], "_write": []});
    });
});

describe("Events - Schedule phase delivery", () => {
    class Evt {
        constructor(public n: number) { }
    }

    test("event emitted in phase A is visible in phase B (requires swapEvents at phase boundary)", () => {
        const w = new World();
        const sched = new Schedule();

        const got: number[] = [];

        sched.add(w, "a", (world: WorldApi) => {
            world.emit(Evt, new Evt(42));
        });

        sched.add(w, "b", (world: WorldApi) => {
            world.drainEvents(Evt, (ev: Evt) => got.push(ev.n));
        });

        sched.run(w, 0.016, ["a", "b"]);
        expect(got).toEqual([42]);
    });

    test("multiple events keep order across phases", () => {
        const w = new World();
        const sched = new Schedule();

        const got: number[] = [];

        sched.add(w, "a", (world: WorldApi) => {
            world.emit(Evt, new Evt(1));
            world.emit(Evt, new Evt(2));
            world.emit(Evt, new Evt(3));
        });

        sched.add(w, "b", (world: WorldApi) => {
            world.drainEvents(Evt, (ev: Evt) => got.push(ev.n));
        });

        sched.run(w, 0.016, ["a", "b"]);
        expect(got).toEqual([1, 2, 3]);
    });
});
