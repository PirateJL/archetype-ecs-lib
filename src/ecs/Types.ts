export type EntityId = number;

export type Entity = Readonly<{
    id: EntityId;
    gen: number;
}>;

export type EntityMeta = {
    gen: number;
    alive: boolean;
    arch: number;   // archetype id
    row: number;    // row in that archetype
}

export type Column<T = unknown> = T[];

export type Signature = ReadonlyArray<TypeId>;

export type ComponentCtor<T> = new (...args: any[]) => T;

/**
 * Internal numeric id for a component "type".
 * (We keep it numeric so signatures can be sorted quickly.)
 */
export type TypeId = number;

export type SystemFn = (world: WorldI, dt: number) => void;

/** Forward declaration to avoid circular import types-only pain. */
export interface WorldI {
    // Minimal surface used by SystemFn, the concrete class implements more.
    flush(): void;
}

// ---- Typed query rows (c1/c2/... follow ctor argument order) ----
export type QueryRow1<A> = { e: Entity; c1: A };
export type QueryRow2<A, B> = { e: Entity; c1: A; c2: B };
export type QueryRow3<A, B, C> = { e: Entity; c1: A; c2: B; c3: C };
export type QueryRow4<A, B, C, D> = { e: Entity; c1: A; c2: B; c3: C; c4: D };
export type QueryRow5<A, B, C, D, E> = { e: Entity; c1: A; c2: B; c3: C; c4: D; c5: E };
export type QueryRow6<A, B, C, D, E, F> = { e: Entity; c1: A; c2: B; c3: C; c4: D; c5: E; c6: F };
