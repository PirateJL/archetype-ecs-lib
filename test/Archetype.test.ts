import { Archetype } from "../src/ecs/Archetype";

describe("Archetype", () => {
    test("constructs columns for each type in signature", () => {
        const a = new Archetype(7, [2, 5]);
        expect(a.id).toBe(7);
        expect(a.sig).toEqual([2, 5]);
        expect(a.entities).toEqual([]);
        expect(a.has(2)).toBe(true);
        expect(a.has(5)).toBe(true);
        expect(a.has(1)).toBe(false);
    });

    test("addRow appends entity and returns row index", () => {
        const a = new Archetype(1, [1]);
        const e = { id: 1, gen: 1 };
        const row = a.addRow(e);
        expect(row).toBe(0);
        expect(a.entities[0]).toBe(e);
    });

    test("removeRow swap-removes and mirrors columns", () => {
        const a = new Archetype(1, [10, 20]);
        const col10 = a.column<number>(10);
        const col20 = a.column<string>(20);

        const e1 = { id: 1, gen: 1 };
        const e2 = { id: 2, gen: 1 };

        // add two rows
        a.addRow(e1); col10.push(111); col20.push("a");
        a.addRow(e2); col10.push(222); col20.push("b");

        // remove first row, should swap in last (e2)
        const moved = a.removeRow(0);
        expect(moved).toEqual(e2);

        expect(a.entities).toEqual([e2]);
        expect(col10).toEqual([222]);
        expect(col20).toEqual(["b"]);
    });

    test("removeRow on last row returns null and pops", () => {
        const a = new Archetype(1, [10]);
        const col10 = a.column<number>(10);

        const e1 = { id: 1, gen: 1 };
        a.addRow(e1);
        col10.push(123);

        const moved = a.removeRow(0);
        expect(moved).toBeNull();
        expect(a.entities).toEqual([]);
        expect(col10).toEqual([]);
    });

    test("removeRow throws on out-of-range", () => {
        const a = new Archetype(1, []);
        expect(() => a.removeRow(0)).toThrow(/out of range/i);
        expect(() => a.removeRow(-1)).toThrow(/out of range/i);
    });

    test("column throws if type missing", () => {
        const a = new Archetype(1, []);
        expect(() => a.column<any>(123)).toThrow(/missing column/i);
    });
});
