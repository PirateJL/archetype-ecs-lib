import { EventChannel } from "./Events";

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
    despawnBundle(entities: Entity[]): void;
    add<T>(e: Entity, ctor: ComponentCtor<T>, value: T): void;
    addBundle(e: Entity, ...items: ComponentCtorBundleItem[]): void;
    remove<T>(e: Entity, ctor: ComponentCtor<T>): void;
    removeBundle(e: Entity, ...ctors: ComponentCtor<any>[]): void;
    hasPending(): boolean;
}

// ---- Typed query rows (c1/c2/... follow ctor argument order) ----
export type QueryRow1<A> = { e: Entity; c1: A };
export type QueryRow2<A, B> = { e: Entity; c1: A; c2: B };
export type QueryRow3<A, B, C> = { e: Entity; c1: A; c2: B; c3: C };
export type QueryRow4<A, B, C, D> = { e: Entity; c1: A; c2: B; c3: C; c4: D };
export type QueryRow5<A, B, C, D, E> = { e: Entity; c1: A; c2: B; c3: C; c4: D; c5: E };
export type QueryRow6<A, B, C, D, E, F> = { e: Entity; c1: A; c2: B; c3: C; c4: D; c5: E; c6: F };

// ---- Typed query tables (SoA columns + entities) ----
export type QueryTable1<A> = { entities: Entity[]; c1: Column<A> };
export type QueryTable2<A, B> = { entities: Entity[]; c1: Column<A>; c2: Column<B> };
export type QueryTable3<A, B, C> = { entities: Entity[]; c1: Column<A>; c2: Column<B>; c3: Column<C> };
export type QueryTable4<A, B, C, D> = { entities: Entity[]; c1: Column<A>; c2: Column<B>; c3: Column<C>; c4: Column<D> };
export type QueryTable5<A, B, C, D, E> = { entities: Entity[]; c1: Column<A>; c2: Column<B>; c3: Column<C>; c4: Column<D>; c5: Column<E> };
export type QueryTable6<A, B, C, D, E, F> = { entities: Entity[]; c1: Column<A>; c2: Column<B>; c3: Column<C>; c4: Column<D>; c5: Column<E>; c6: Column<F> };

export type WorldStats = Readonly<{
    // --- simulation totals ---
    aliveEntities: number;
    archetypes: number;
    rows: number;
    systems: number;
    resources: number;
    eventChannels: number;
    pendingCommands: boolean;

    // --- profiling (last completed frame) ---
    frame: number;
    dt: number;             // dt passed to update/run
    frameMs: number;        // total run/update time measured
    phaseMs: Readonly<Record<string, number>>;
    systemMs: Readonly<Record<string, number>>;
}>;

export type WorldStatsHistory = Readonly<{
    /** Max frames kept in history (ring-buffer window). */
    capacity: number;

    /** How many samples are currently stored (<= capacity). */
    size: number;

    /** Rolling history for overall timing. */
    dt: ReadonlyArray<number>;
    frameMs: ReadonlyArray<number>;

    /**
     * Rolling history per phase/system.
     * Arrays align with dt/frameMs indices (same `size`).
     */
    phaseMs: Readonly<Record<string, ReadonlyArray<number>>>;
    systemMs: Readonly<Record<string, ReadonlyArray<number>>>;
}>;

/**
 * Public World API visible from system functions.
 * Structural typing keeps typings fast and avoids generic plumbing across the whole library.
 */
export interface WorldApi
{
    // ---- Debug / tooling ----
    stats(): WorldStats;
    statsHistory(): WorldStatsHistory;

    /** @internal Phase -> systems mapping for Schedule */
    readonly _scheduleSystems: Map<string, SystemFn[]>;

    /** @internal Returns the number of systems registered via addSystem() */
    _getSystemCount(): number;

    /** Enables/disables profiling (system/phase timing). */
    setProfilingEnabled(enabled: boolean): void;

    /** Set how many frames of the profiling history to keep (default: 120). */
    setProfilingHistorySize(frames: number): void;

    // deferred ops
    cmd(): CommandsApi;

    addSystem(fn: SystemFn): this;
    update(dt: number): void;
    flush(): void;

    //#region ----- Resources lifecycle -----
    // (singletons / world globals)
    /**
     * Insert or replace a resource (singleton) stored on the World, keyed by ctor.
     * This is NOT a structural change (safe during iteration).
     */
    setResource<T>(key: ComponentCtor<T>, value: T): void;

    /**
     * Returns the resource value if present, otherwise `undefined`.
     * Use this for optional resources (debug tools, plugins, editor-only state, etc.).
     *
     * Note: if you explicitly stored `undefined` as a resource value, this also returns `undefined`.
     * Use `hasResource()` to distinguish "missing" vs "present but undefined".
     */
    getResource<T>(key: ComponentCtor<T>): T | undefined;

    /**
     * Returns the resource value if present, otherwise throws.
     * Use this for required resources (Time, Input, AssetCache, Config...) to keep systems clean.
     *
     * The check is based on `hasResource(key)` so "missing" is unambiguous even if the stored value is `undefined`.
     */
    requireResource<T>(key: ComponentCtor<T>): T;
    hasResource<T>(key: ComponentCtor<T>): boolean;
    removeResource<T>(key: ComponentCtor<T>): boolean;
    //#endregion

    /**
     * Insert once, returning the existing value if already present.
     * Great for bootstrapping defaults without double-initializing.
     */
    initResource<T>(key: ComponentCtor<T>, factory: () => T): T;

    //#region ----- Events lifecycle -----
    // (phase-scoped, double-buffered)

    /** Emit an event into the current phase (write buffer). */
    emit<T>(key: ComponentCtor<T>, ev: T): void;

    /**
     * Get the channel for an event type (created on first use).
     * - readable events are from the previous phase
     * - emitted events go to the current phase
     */
    events<T>(key: ComponentCtor<T>): EventChannel<T>;

    /**
     * Drain readable events for this type (previous phase), calling fn for each.
     * If the channel doesn't exist yet, this is a no-op.
     */
    drainEvents<T>(key: ComponentCtor<T>, fn: (ev: T) => void): void;

    /**
     * Clears readable events for a type (or all types if omitted).
     * Does not affect entity structure.
     */
    clearEvents<T>(key?: ComponentCtor<T>): void;

    /**
     * @internal Called by Schedule at phase boundaries to deliver events to the next phase.
     */
    swapEvents(): void;
    //#endregion

    //#region ----- entity lifecycle -----
    spawn(): Entity;
    spawnMany(...items: ComponentCtorBundleItem[]): Entity;
    despawn(e: Entity): void;
    despawnMany(entities: Entity[]): void;
    isAlive(e: Entity): boolean;
    //#endregion

    //#region ----- component ops -----
    add<T>(e: Entity, ctor: ComponentCtor<T>, value: T): void;
    addMany(e: Entity, ...items: ComponentCtorBundleItem[]): void;
    remove<T>(e: Entity, ctor: ComponentCtor<T>): void;
    removeMany(e: Entity, ...ctors: ComponentCtor<any>[]): void;
    has<T>(e: Entity, ctor: ComponentCtor<T>): boolean;
    get<T>(e: Entity, ctor: ComponentCtor<T>): T | undefined;
    set<T>(e: Entity, ctor: ComponentCtor<T>, value: T): void;
    //#endregion

    //#region ----- query ops -----
    // ---- Typed query rows (c1/c2/... follow ctor argument order) ----
    query<A>(c1: ComponentCtor<A>): Iterable<QueryRow1<A>>;
    query<A, B>(c1: ComponentCtor<A>, c2: ComponentCtor<B>): Iterable<QueryRow2<A, B>>;
    query<A, B, C>(c1: ComponentCtor<A>, c2: ComponentCtor<B>, c3: ComponentCtor<C>): Iterable<QueryRow3<A, B, C>>;
    query<A, B, C, D>(c1: ComponentCtor<A>, c2: ComponentCtor<B>, c3: ComponentCtor<C>, c4: ComponentCtor<D>): Iterable<QueryRow4<A, B, C, D>>;
    query<A, B, C, D, E>(c1: ComponentCtor<A>, c2: ComponentCtor<B>, c3: ComponentCtor<C>, c4: ComponentCtor<D>, c5: ComponentCtor<E>): Iterable<QueryRow5<A, B, C, D, E>>;
    query<A, B, C, D, E, F>(c1: ComponentCtor<A>, c2: ComponentCtor<B>, c3: ComponentCtor<C>, c4: ComponentCtor<D>, c5: ComponentCtor<E>, c6: ComponentCtor<F>): Iterable<QueryRow6<A, B, C, D, E, F>>;
    query(...ctors: ComponentCtor<any>[]): Iterable<any>;

    // ---- Table queries (SoA columns per archetype, no per-entity allocations) ----
    queryTables<A>(c1: ComponentCtor<A>): Iterable<QueryTable1<A>>;
    queryTables<A, B>(c1: ComponentCtor<A>, c2: ComponentCtor<B>): Iterable<QueryTable2<A, B>>;
    queryTables<A, B, C>(c1: ComponentCtor<A>, c2: ComponentCtor<B>, c3: ComponentCtor<C>): Iterable<QueryTable3<A, B, C>>;
    queryTables<A, B, C, D>(c1: ComponentCtor<A>, c2: ComponentCtor<B>, c3: ComponentCtor<C>, c4: ComponentCtor<D>): Iterable<QueryTable4<A, B, C, D>>;
    queryTables<A, B, C, D, E>(c1: ComponentCtor<A>, c2: ComponentCtor<B>, c3: ComponentCtor<C>, c4: ComponentCtor<D>, c5: ComponentCtor<E>): Iterable<QueryTable5<A, B, C, D, E>>;
    queryTables<A, B, C, D, E, F>(c1: ComponentCtor<A>, c2: ComponentCtor<B>, c3: ComponentCtor<C>, c4: ComponentCtor<D>, c5: ComponentCtor<E>, c6: ComponentCtor<F>): Iterable<QueryTable6<A, B, C, D, E, F>>;
    queryTables(...ctors: ComponentCtor<any>[]): Iterable<any>;

    // ---- Callback queries (no generator yield objects) ----
    queryEach<A>(c1: ComponentCtor<A>, fn: (e: Entity, c1: A) => void): void;
    queryEach<A, B>(c1: ComponentCtor<A>, c2: ComponentCtor<B>, fn: (e: Entity, c1: A, c2: B) => void): void;
    queryEach<A, B, C>(c1: ComponentCtor<A>, c2: ComponentCtor<B>, c3: ComponentCtor<C>, fn: (e: Entity, c1: A, c2: B, c3: C) => void): void;
    queryEach<A, B, C, D>(c1: ComponentCtor<A>, c2: ComponentCtor<B>, c3: ComponentCtor<C>, c4: ComponentCtor<D>, fn: (e: Entity, c1: A, c2: B, c3: C, c4: D) => void): void;
    queryEach<A, B, C, D, E>(c1: ComponentCtor<A>, c2: ComponentCtor<B>, c3: ComponentCtor<C>, c4: ComponentCtor<D>, c5: ComponentCtor<E>, fn: (e: Entity, c1: A, c2: B, c3: C, c4: D, c5: E) => void): void;
    queryEach<A, B, C, D, E, F>(c1: ComponentCtor<A>, c2: ComponentCtor<B>, c3: ComponentCtor<C>, c4: ComponentCtor<D>, c5: ComponentCtor<E>, c6: ComponentCtor<F>, fn: (e: Entity, c1: A, c2: B, c3: C, c4: D, c5: E, c6: F) => void): void;
    queryEach(...args: any[]): void;
    //#endregion
}
