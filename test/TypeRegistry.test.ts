import { typeId } from "../src/ecs/TypeRegistry";

class Position { constructor(public x = 0, public y = 0) {} }
class Velocity { constructor(public dx = 0, public dy = 0) {} }

describe("TypeRegistry.typeId", () => {
    it("returns the same id for the same ctor", () => {
        const a = typeId(Position);
        const b = typeId(Position);
        expect(a).toBe(b);
    });

    it("returns different ids for different ctors", () => {
        const a = typeId(Position);
        const b = typeId(Velocity);
        expect(a).not.toBe(b);
    });
});
