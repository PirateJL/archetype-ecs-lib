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

export type ComponentCtorBundleItem<T = any> = readonly [ComponentCtor<T>, T];

/**
 * Internal numeric id for a component "type".
 * (We keep it numeric so signatures can be sorted quickly.)
 */
export type TypeId = number;

export type SystemFn = (world: WorldApi, dt: number) => void;

/**
 * Commands API exposed to systems.
 * > Hides internal stuff like `drain()`
 */
export interface CommandsApi
{
    spawn(init?: (e: Entity) => void): void;
    spawnBundle(...items: ComponentCtorBundleItem[]): void;
    despawn(e: Entity): void;
    despawnMany(entities: Entity[]): void;
    add<T>(e: Entity, ctor: ComponentCtor<T>, value: T): void;
    addMany(e: Entity, ...items: ComponentCtorBundleItem[]): void;
    remove<T>(e: Entity, ctor: ComponentCtor<T>): void;
    removeMany(e: Entity, ...ctors: ComponentCtor<any>[]): void;
}

// ---- Typed query rows (c1/c2/... follow ctor argument order) ----
export type QueryRow1<A> = { e: Entity; c1: A };
export type QueryRow2<A, B> = { e: Entity; c1: A; c2: B };
export type QueryRow3<A, B, C> = { e: Entity; c1: A; c2: B; c3: C };
export type QueryRow4<A, B, C, D> = { e: Entity; c1: A; c2: B; c3: C; c4: D };
export type QueryRow5<A, B, C, D, E> = { e: Entity; c1: A; c2: B; c3: C; c4: D; c5: E };
export type QueryRow6<A, B, C, D, E, F> = { e: Entity; c1: A; c2: B; c3: C; c4: D; c5: E; c6: F };

/**
 * Public World API visible from system functions.
 * Structural typing keeps typings fast and avoids generic plumbing across the whole library.
 */
export interface WorldApi
{
    // deferred ops
    cmd(): CommandsApi;

    flush(): void;

    // entity lifecycle
    spawn(): Entity;
    spawnBundle(...items: ComponentCtorBundleItem[]): void;
    despawn(e: Entity): void;
    despawnMany(entities: Entity[]): void;
    isAlive(e: Entity): boolean;

    // component ops
    add<T>(e: Entity, ctor: ComponentCtor<T>, value: T): void;
    addMany(e: Entity, ...items: ComponentCtorBundleItem[]): void;
    remove<T>(e: Entity, ctor: ComponentCtor<T>): void;
    removeMany(e: Entity, ...ctors: ComponentCtor<any>[]): void;
    has<T>(e: Entity, ctor: ComponentCtor<T>): boolean;
    get<T>(e: Entity, ctor: ComponentCtor<T>): T | undefined;
    set<T>(e: Entity, ctor: ComponentCtor<T>, value: T): void;

    // query ops
    // ---- Typed query rows (c1/c2/... follow ctor argument order) ----
    query<A>(c1: ComponentCtor<A>): Iterable<QueryRow1<A>>;
    query<A, B>(c1: ComponentCtor<A>, c2: ComponentCtor<B>): Iterable<QueryRow2<A, B>>;
    query<A, B, C>(c1: ComponentCtor<A>, c2: ComponentCtor<B>, c3: ComponentCtor<C>): Iterable<QueryRow3<A, B, C>>;
    query<A, B, C, D>(c1: ComponentCtor<A>, c2: ComponentCtor<B>, c3: ComponentCtor<C>, c4: ComponentCtor<D>): Iterable<QueryRow4<A, B, C, D>>;
    query<A, B, C, D, E>(c1: ComponentCtor<A>, c2: ComponentCtor<B>, c3: ComponentCtor<C>, c4: ComponentCtor<D>, c5: ComponentCtor<E>): Iterable<QueryRow5<A, B, C, D, E>>;
    query<A, B, C, D, E, F>(c1: ComponentCtor<A>, c2: ComponentCtor<B>, c3: ComponentCtor<C>, c4: ComponentCtor<D>, c5: ComponentCtor<E>, c6: ComponentCtor<F>): Iterable<QueryRow6<A, B, C, D, E, F>>;
    query(...ctors: ComponentCtor<any>[]): Iterable<any>;
}
