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

export type ComponentCtor<T> = { new (...args: any[]): T } | Function;

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