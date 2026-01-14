import type { TypeId, ComponentCtor } from "./Types";

const ctorToId = new WeakMap<ComponentCtor<any>, TypeId>();
let nextId: TypeId = 1;

/**
 * Returns a stable numeric TypeId for a component constructor.
 */
export function typeId<T>(ctor: ComponentCtor<T>): TypeId {
    const existing = ctorToId.get(ctor);
    if (existing != null) return existing;
    const id = nextId++;
    ctorToId.set(ctor, id);
    return id;
}