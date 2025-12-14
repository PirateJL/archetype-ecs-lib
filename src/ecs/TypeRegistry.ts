import { TypeId, ComponentCtor } from "./Types";

const ctorToId = new WeakMap<Function, TypeId>();
let nextId: TypeId = 1;

/**
 * Returns a stable numeric TypeId for a component constructor (or token function).
 */
export function typeId<T>(ctor: ComponentCtor<T>): TypeId {
    const key = ctor as unknown as Function;
    const existing = ctorToId.get(key);
    if (existing != null) return existing;
    const id = nextId++;
    ctorToId.set(key, id);
    return id;
}
