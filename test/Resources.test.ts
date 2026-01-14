import { World } from "../src/ecs/World";
import type { ComponentCtor } from "../src/ecs/Types";

describe("Resources (singletons)", () => {
    class FooRes {
        constructor(public n: number) { }
    }

    test("getResource returns undefined when missing; requireResource throws; hasResource is false", () => {
        const w = new World();

        expect(w.hasResource(FooRes)).toBe(false);
        expect(w.getResource(FooRes)).toBeUndefined();
        expect(() => w.requireResource(FooRes)).toThrow(/missing resource/i);
    });

    test("setResource stores value; getResource/requireResource return it; hasResource is true", () => {
        const w = new World();
        const foo = new FooRes(123);

        w.setResource(FooRes, foo);

        expect(w.hasResource(FooRes)).toBe(true);
        expect(w.getResource(FooRes)).toBe(foo);
        expect(w.requireResource(FooRes)).toBe(foo);
        expect(w.requireResource(FooRes).n).toBe(123);
    });

    test("removeResource deletes entry and returns true; second remove returns false", () => {
        const w = new World();
        w.setResource(FooRes, new FooRes(1));

        expect(w.removeResource(FooRes)).toBe(true);
        expect(w.hasResource(FooRes)).toBe(false);
        expect(w.getResource(FooRes)).toBeUndefined();

        expect(w.removeResource(FooRes)).toBe(false);
    });

    test("initResource inserts once and returns existing value without calling factory again", () => {
        const w = new World();

        const factory = jest.fn(() => new FooRes(9));

        const a = w.initResource(FooRes, factory);
        const b = w.initResource(FooRes, factory);

        expect(a).toBe(b);
        expect(a.n).toBe(9);
        expect(factory).toHaveBeenCalledTimes(1);

        // If setResource replaces, initResource should return the new one after replacement exists
        const replaced = new FooRes(77);
        w.setResource(FooRes, replaced);

        const c = w.initResource(FooRes, () => new FooRes(999));
        expect(c).toBe(replaced);
        expect(c.n).toBe(77);
    });

    test("hasResource can distinguish missing vs present-but-undefined (using hasResource + getResource)", () => {
        const w = new World();

        // Store an explicit undefined (escape typing for the test)
        w.setResource(FooRes as unknown as ComponentCtor<any>, undefined);

        expect(w.getResource(FooRes as unknown as ComponentCtor<any>)).toBeUndefined();
        expect(w.hasResource(FooRes as unknown as ComponentCtor<any>)).toBe(true);
    });

    test("supports token function keys (non-class ctor)", () => {
        const w = new World();

        type TokenRes = { ok: boolean };
        const TokenKey = (() => { }) as unknown as ComponentCtor<TokenRes>;

        expect(w.getResource(TokenKey)).toBeUndefined();
        expect(w.hasResource(TokenKey)).toBe(false);

        const v: TokenRes = { ok: true };
        w.setResource(TokenKey, v);

        expect(w.hasResource(TokenKey)).toBe(true);
        expect(w.getResource(TokenKey)).toBe(v);
        expect(w.requireResource(TokenKey)).toBe(v);

        expect(w.removeResource(TokenKey)).toBe(true);
        expect(w.hasResource(TokenKey)).toBe(false);
    });
});
