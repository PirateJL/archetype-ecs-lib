import { Archetype } from "./Archetype";
import { type Command, Commands } from "./Commands";
import { EntityManager } from "./EntityManager";
import { EventChannel } from "./Events";
import { mergeSignature, signatureHasAll, signatureKey, subtractSignature } from "./Signature";
import { typeId } from "./TypeRegistry";
import type {
    ComponentCtor,
    ComponentCtorBundleItem,
    Entity,
    EntityMeta,
    QueryRow1,
    QueryRow2,
    QueryRow3,
    QueryRow4,
    QueryRow5,
    QueryRow6,
    QueryTable1,
    QueryTable2,
    QueryTable3,
    QueryTable4,
    QueryTable5,
    QueryTable6,
    Signature,
    SystemFn,
    TypeId,
    WorldApi, WorldStats, WorldStatsHistory
} from "./Types";

export class World implements WorldApi
{
    private readonly entities = new EntityManager();

    private readonly archetypes: Archetype[] = [];
    private readonly archByKey = new Map<string, Archetype>();

    private readonly systems: SystemFn[] = [];

    private readonly commands = new Commands();
    private _iterateDepth: number = 0;

    private readonly resources = new Map<ComponentCtor<any>, any>();
    private readonly eventChannels = new Map<ComponentCtor<any>, EventChannel<any>>();

    /** @internal Phase -> systems mapping for Schedule */
    public readonly _scheduleSystems = new Map<string, SystemFn[]>();

    // Runtime warning system: track lifecycle usage to detect conflicts
    public _hasUsedWorldUpdate = false;
    public _hasUsedScheduleRun = false;

    // ---- Profiling / stats (last completed frame) ----
    private _profilingEnabled = true;
    private _frameCounter = 0;
    private _lastDt = 0;
    private _lastFrameMs = 0;
    private readonly _phaseMs = new Map<string, number>();
    private readonly _systemMs = new Map<string, number>();

    // ---- Profiling history (rolling window) ----
    private _historyCapacity = 120;
    private readonly _histDt: number[] = [];
    private readonly _histFrameMs: number[] = [];
    private readonly _histPhaseMs = new Map<string, number[]>();
    private readonly _histSystemMs = new Map<string, number[]>();

    constructor()
    {
        // Archetype 0: empty signature
        const archetype0 = new Archetype(0, []);
        this.archetypes[0] = archetype0;
        this.archByKey.set("", archetype0);
    }

    public setProfilingEnabled(enabled: boolean): void
    {
        this._profilingEnabled = enabled;
    }

    public setProfilingHistorySize(frames: number): void
    {
        const n = Math.max(0, Math.floor(frames));
        this._historyCapacity = n;
        this._trimHistoryToCapacity();
    }

    public statsHistory(): WorldStatsHistory
    {
        const phaseMs: Record<string, ReadonlyArray<number>> = Object.create(null);
        for (const [k, v] of this._histPhaseMs) phaseMs[k] = v;

        const systemMs: Record<string, ReadonlyArray<number>> = Object.create(null);
        for (const [k, v] of this._histSystemMs) systemMs[k] = v;

        return {
            capacity: this._historyCapacity,
            size: this._histFrameMs.length,
            dt: this._histDt,
            frameMs: this._histFrameMs,
            phaseMs,
            systemMs
        };
    }

    /**
     * Rich runtime statistics (counts + last-frame timings).
     * Note: `aliveEntities` is computed on demand (O(n) over entity meta).
     */
    public stats(): WorldStats
    {
        let alive = 0;
        for (let id = 1; id < this.entities.meta.length; id++) {
            const m = this.entities.meta[id];
            if (m && m.alive) alive++;
        }

        let archCount = 0;
        let rows = 0;
        for (const a of this.archetypes) {
            if (!a) continue;
            archCount++;
            rows += a.entities.length;
        }

        const phaseMs: Record<string, number> = Object.create(null);
        for (const [k, v] of this._phaseMs) phaseMs[k] = v;

        const systemMs: Record<string, number> = Object.create(null);
        for (const [k, v] of this._systemMs) systemMs[k] = v;

        let systemCount = this.systems.length;
        if (this._scheduleSystems.size > 0) {
            systemCount += this._scheduleSystems.size;
        }

        return {
            aliveEntities: alive,
            archetypes: archCount,
            rows,
            systems: systemCount,
            resources: this.resources.size,
            eventChannels: this.eventChannels.size,
            pendingCommands: this.commands.hasPending(),
            frame: this._frameCounter,
            dt: this._lastDt,
            frameMs: this._lastFrameMs,
            phaseMs,
            systemMs
        };
    }

    private _trimHistoryToCapacity(): void
    {
        const cap = this._historyCapacity;

        const trimArray = (arr: number[]) => {
            if (cap === 0) {
                arr.length = 0;
                return;
            }
            while (arr.length > cap) arr.shift();
        };

        trimArray(this._histDt);
        trimArray(this._histFrameMs);
        for (const arr of this._histPhaseMs.values()) trimArray(arr);
        for (const arr of this._histSystemMs.values()) trimArray(arr);
    }

    private _pushSeriesFrame(series: Map<string, number[]>, current: Map<string, number>): void
    {
        const sizeBefore = this._histFrameMs.length; // same as dt length before push

        // Ensure existing keys get a value (0 if missing this frame)
        for (const [k, arr] of series) {
            const v = current.get(k) ?? 0;
            arr.push(v);
            if (this._historyCapacity === 0) arr.length = 0;
            else while (arr.length > this._historyCapacity) arr.shift();
        }

        // New keys discovered this frame: backfill zeros so lengths align
        for (const [k, v] of current) {
            if (series.has(k)) continue;
            const arr = new Array<number>(sizeBefore).fill(0);
            arr.push(v);
            series.set(k, arr);
            if (this._historyCapacity === 0) arr.length = 0;
            else while (arr.length > this._historyCapacity) arr.shift();
        }
    }

    /** @internal Called by Schedule/World.update to start a new profiling frame */
    public _profBeginFrame(dt: number): number
    {
        this._frameCounter++;
        this._lastDt = dt;

        this._phaseMs.clear();
        this._systemMs.clear();

        if (!this._profilingEnabled) {
            this._lastFrameMs = 0;
            return 0;
        }

        return performance.now();
    }

    /** @internal Called by Schedule/World.update to end a new profiling frame */
    public _profEndFrame(frameStartMs: number): void
    {
        if (!this._profilingEnabled) return;

        this._lastFrameMs = performance.now() - frameStartMs;

        // Update history (aligned series)
        this._histDt.push(this._lastDt);
        this._histFrameMs.push(this._lastFrameMs);
        this._trimHistoryToCapacity();

        this._pushSeriesFrame(this._histPhaseMs, this._phaseMs);
        this._pushSeriesFrame(this._histSystemMs, this._systemMs);
    }

    /** @internal */
    public _profAddPhase(phase: string, ms: number): void
    {
        if (!this._profilingEnabled) return;
        this._phaseMs.set(phase, (this._phaseMs.get(phase) ?? 0) + ms);
    }

    /** @internal */
    public _profAddSystem(name: string, ms: number): void
    {
        if (!this._profilingEnabled) return;
        this._systemMs.set(name, (this._systemMs.get(name) ?? 0) + ms);
    }

    /** Queue structural changes to apply safely after systems run. */
    public cmd(): Commands
    {
        return this.commands;
    }

    public addSystem(fn: SystemFn): this
    {
        this.systems.push(fn);
        return this;
    }

    /**
     * Simple single-phase update.
     * Runs all systems added via `addSystem()`, flushes commands, and swaps events once.
     *
     * This is the recommended approach for:
     * - Simple applications with basic game loops
     * - Single-phase system execution
     * - Rapid prototyping
     *
     * @example
     * ```TypeScript
     * // Simple game loop
     * function gameLoop(dt: number) {
     *   world.update(dt);
     * }
     * ```
     *
     * @note If you are using `Schedule` for multiphase updates, do NOT use this method.
     *  Use `schedule.run(world, dt, phases)` instead.
     *
     * @throws {Error} If both World.update() and Schedule.run() are used on the same World instance
     */
    public update(dt: number): void
    {
        // Runtime conflict detection
        if (this._hasUsedScheduleRun) {
            this._warnAboutLifecycleConflict("World.update");
        }
        this._hasUsedWorldUpdate = true;

        const frameStart = this._profBeginFrame(dt);

        this._iterateDepth++;
        try {
            for (const s of this.systems) {
                if (this._profilingEnabled) {
                    const t0 = performance.now();
                    s(this, dt);
                    const name = s.name && s.name.length > 0 ? s.name : "<anonymous>";
                    this._profAddSystem(name, performance.now() - t0);
                } else {
                    s(this, dt);
                }
            }
        } finally {
            this._iterateDepth--;
            this.flush();
            this.swapEvents();
            this._profAddPhase("update", this._profilingEnabled ? (performance.now() - frameStart) : 0);
            this._profEndFrame(frameStart);
        }
    }

    public flush(): void
    {
        this._ensureNotIterating("flush");
        // Apply commands until queue is empty. This allows spawn(init) to enqueue add/remove
        // operations that will be applied during the same flush.
        while (true) {
            const ops = this.commands.drain();
            if (ops.length === 0) break;
            for (const op of ops) this._apply(op);
        }
    }

    //#region ---------- Resources (singletons) ----------
    public setResource<T>(key: ComponentCtor<T>, value: T): void
    {
        this.resources.set(key, value);
    }

    public getResource<T>(key: ComponentCtor<T>): T | undefined
    {
        if (!this.resources.has(key)) return undefined;
        return this.resources.get(key) as T;
    }

    public requireResource<T>(key: ComponentCtor<T>): T
    {
        if (!this.resources.has(key)) {
            const name = this._formatCtor(key);
            throw new Error(
                `requireResource(${name}) failed: resource missing. ` +
                `Insert it via world.setResource(${name}, value) or world.initResource(${name}, () => value).`
            );
        }
        return this.resources.get(key) as T;
    }

    public hasResource<T>(key: ComponentCtor<T>): boolean
    {
        return this.resources.has(key);
    }

    public removeResource<T>(key: ComponentCtor<T>): boolean
    {
        return this.resources.delete(key);
    }

    public initResource<T>(key: ComponentCtor<T>, factory: () => T): T
    {
        if (this.resources.has(key)) return this.resources.get(key) as T;
        const value = factory();
        this.resources.set(key, value);
        return value;
    }
    //#endregion

    //#region ---------- Events (phase-scoped) ----------
    public emit<T>(key: ComponentCtor<T>, ev: T): void
    {
        this._events(key).emit(ev);
    }

    public events<T>(key: ComponentCtor<T>): EventChannel<T>
    {
        return this._events(key);
    }

    public drainEvents<T>(key: ComponentCtor<T>, fn: (ev: T) => void): void
    {
        const ch = this.eventChannels.get(key) as EventChannel<T> | undefined;
        if (!ch) return;
        ch.drain(fn);
    }

    public clearEvents<T>(key?: ComponentCtor<T>): void
    {
        if (key) {
            const ch = this.eventChannels.get(key);
            if (!ch) return;
            ch.clear();
            return;
        }

        // clear all readable buffers
        for (const ch of this.eventChannels.values()) ch.clear();
    }

    /** @internal Called by Schedule at phase boundaries */
    public swapEvents(): void
    {
        for (const ch of this.eventChannels.values()) ch.swapBuffers();
    }
    //#endregion


    //#region ---------- Entity lifecycle ----------
    public spawn(): Entity
    {
        const entity = this.entities.create();
        // place in archetype 0
        const archetype0 = this.archetypes[0]!;
        const row = archetype0.addRow(entity);
        const entityMeta = this.entities.meta[entity.id]!;
        entityMeta.arch = 0;
        entityMeta.row = row;
        return entity;
    }

    public spawnMany(...items: ComponentCtorBundleItem[]): Entity
    {
        const e = this.spawn();
        for (const [ctor, value] of items) this.add(e, ctor as any, value as any);
        return e;
    }

    public isAlive(e: Entity): boolean
    {
        return this.entities.isAlive(e);
    }

    public despawn(e: Entity): void
    {
        this._assertAlive(e, 'despawn');
        this._ensureNotIterating("despawn");
        this._removeFromArchetype(e);
        this.entities.kill(e);
    }

    public despawnMany(entities: Entity[]): void
    {
        for (const e of entities) this.despawn(e);
    }
    //#endregion

    //#region ---------- Components ----------
    public has<T>(e: Entity, ctor: ComponentCtor<T>): boolean
    {
        const meta = this.entities.meta[e.id];
        if (!meta || !meta.alive || meta.gen !== e.gen) return false;
        const tid = typeId(ctor);
        return this.archetypes[meta.arch]!.has(tid);
    }

    public get<T>(e: Entity, ctor: ComponentCtor<T>): T | undefined
    {
        const meta = this.entities.meta[e.id];
        if (!meta || !meta.alive || meta.gen !== e.gen) return undefined;
        const tid = typeId(ctor);
        const a = this.archetypes[meta.arch]!;
        if (!a.has(tid)) return undefined;
        return a.column<T>(tid)[meta.row]!;
    }

    public set<T>(e: Entity, ctor: ComponentCtor<T>, value: T): void
    {
        const op = `set(${this._formatCtor(ctor)})`;
        const meta = this._assertAlive(e, op);

        const tid = typeId(ctor);
        const a = this.archetypes[meta.arch]!;

        if (!a.has(tid)) throw new Error(`set(${this._formatCtor(ctor)}) requires component to exist on ${this._formatEntity(e)}; use add()`);
        a.column<T>(tid)[meta.row] = value;
    }

    public add<T>(e: Entity, ctor: ComponentCtor<T>, value: T): void
    {
        const op = `add(${this._formatCtor(ctor)})`;
        this._assertAlive(e, op);
        this._ensureNotIterating(op);

        const tid = typeId(ctor);
        const srcMeta = this.entities.meta[e.id]!;
        const src = this.archetypes[srcMeta.arch]!;

        if (src.has(tid)) {
            // overwrite in-place
            src.column<T>(tid)[srcMeta.row] = value;
            return;
        }

        const dstSig = mergeSignature(src.sig, tid);
        const dst = this._getOrCreateArchetype(dstSig);

        this._moveEntity(e, src, srcMeta.row, dst, (t: TypeId) => {
            if (t === tid) return value;
            return src.column<any>(t)[srcMeta.row];
        });
    }

    public addMany(e: Entity, ...items: ComponentCtorBundleItem[]): void
    {
        if (items.length === 0) return;

        this._assertAlive(e, "addMany");
        this._ensureNotIterating("addMany");

        const srcMeta = this.entities.meta[e.id]!;
        const src = this.archetypes[srcMeta.arch]!;

        // Build component map: TypeId -> value
        const newComps = new Map<TypeId, any>();
        for (const [ctor, value] of items) {
            const tid = typeId(ctor as any);
            newComps.set(tid, value);
        }

        // Compute final signature: src.sig + new components
        const dstSig = src.sig.slice() as TypeId[];
        for (const tid of newComps.keys()) {
            if (!src.has(tid)) {
                // Insert in sorted order
                let i = 0;
                while (i < dstSig.length && dstSig[i] < tid) i++;
                if (dstSig[i] !== tid) {
                    dstSig.splice(i, 0, tid);
                }
            } else {
                // Component already exists, update in-place
                src.column<any>(tid)[srcMeta.row] = newComps.get(tid);
                newComps.delete(tid);
            }
        }

        // If all components were in-place updates, no move needed
        if (newComps.size === 0) return;

        // Single move to final archetype
        const dst = this._getOrCreateArchetype(dstSig);
        this._moveEntity(e, src, srcMeta.row, dst, (t: TypeId) => {
            // Use new value if adding this component, otherwise copy from src
            return newComps.has(t) ? newComps.get(t) : src.column<any>(t)[srcMeta.row];
        });
    }

    public remove<T>(e: Entity, ctor: ComponentCtor<T>): void
    {
        const op = `remove(${this._formatCtor(ctor)})`;
        this._assertAlive(e, op);
        this._ensureNotIterating(op);

        const tid = typeId(ctor);
        const srcMeta = this.entities.meta[e.id]!;
        const src = this.archetypes[srcMeta.arch]!;
        if (!src.has(tid)) return;

        const dstSig = subtractSignature(src.sig, tid);
        const dst = this._getOrCreateArchetype(dstSig);

        this._moveEntity(e, src, srcMeta.row, dst, (t: TypeId) => {
            // copy all but removed, but dstSig guarantees t != tid
            return src.column<any>(t)[srcMeta.row];
        });
    }

    public removeMany(e: Entity, ...ctors: ComponentCtor<any>[]): void
    {
        if (ctors.length === 0) return;

        this._assertAlive(e, "removeMany");
        this._ensureNotIterating("removeMany");

        const srcMeta = this.entities.meta[e.id]!;
        const src = this.archetypes[srcMeta.arch]!;

        // Collect TypeIds to remove
        const toRemove = new Set<TypeId>();
        for (const ctor of ctors) {
            const tid = typeId(ctor);
            if (src.has(tid)) {
                toRemove.add(tid);
            }
        }

        // If nothing to remove, no-op
        if (toRemove.size === 0) return;

        // Compute final signature: src.sig - removed components
        const dstSig = src.sig.filter(tid => !toRemove.has(tid));

        // Single move to final archetype
        const dst = this._getOrCreateArchetype(dstSig);
        this._moveEntity(e, src, srcMeta.row, dst, (t: TypeId) => {
            // Copy all components except removed ones (dstSig guarantees t is not removed)
            return src.column<any>(t)[srcMeta.row];
        });
    }
    //#endregion

    //region ---------- Queries ----------
    /**
     * Query all entities having all required component types.
     * Iterates archetypes (tables) and yields SoA columns for cache-friendly loops.
     */
    public query<A>(c1: ComponentCtor<A>): Iterable<QueryRow1<A>>;
    public query<A, B>(c1: ComponentCtor<A>, c2: ComponentCtor<B>): Iterable<QueryRow2<A, B>>;
    public query<A, B, C>(c1: ComponentCtor<A>, c2: ComponentCtor<B>, c3: ComponentCtor<C>): Iterable<QueryRow3<A, B, C>>;
    public query<A, B, C, D>(c1: ComponentCtor<A>, c2: ComponentCtor<B>, c3: ComponentCtor<C>, c4: ComponentCtor<D>): Iterable<QueryRow4<A, B, C, D>>;
    public query<A, B, C, D, E>(c1: ComponentCtor<A>, c2: ComponentCtor<B>, c3: ComponentCtor<C>, c4: ComponentCtor<D>, c5: ComponentCtor<E>): Iterable<QueryRow5<A, B, C, D, E>>;
    public query<A, B, C, D, E, F>(c1: ComponentCtor<A>, c2: ComponentCtor<B>, c3: ComponentCtor<C>, c4: ComponentCtor<D>, c5: ComponentCtor<E>, c6: ComponentCtor<F>): Iterable<QueryRow6<A, B, C, D, E, F>>;
    public query(...ctors: ComponentCtor<any>[]): Iterable<any>
    {
        const { requested, needSorted } = World._buildQueryTypeIds(ctors);

        function* gen(world: World): IterableIterator<any>
        {
            world._iterateDepth++;
            try {
                for (const a of world.archetypes) {
                    if (!a) continue;
                    if (!signatureHasAll(a.sig, needSorted)) continue;

                    // Return columns in requested order (c1,c2,c3...).
                    const cols = new Array<any[]>(requested.length);
                    for (let i = 0; i < requested.length; i++) cols[i] = a.column<any>(requested[i]!);

                    for (let row = 0; row < a.entities.length; row++) {
                        const e = a.entities[row]!;
                        const out: any = { e };
                        for (let i = 0; i < cols.length; i++) out[`c${i + 1}`] = cols[i]![row];
                        yield out;
                    }
                }
            } finally {
                world._iterateDepth--;
            }
        }

        return gen(this);
    }

    /**
     * Table query: yields one item per matching archetype (SoA columns + entity array).
     * This avoids allocating one object per entity row.
     */
    public queryTables<A>(c1: ComponentCtor<A>): Iterable<QueryTable1<A>>;
    public queryTables<A, B>(c1: ComponentCtor<A>, c2: ComponentCtor<B>): Iterable<QueryTable2<A, B>>;
    public queryTables<A, B, C>(c1: ComponentCtor<A>, c2: ComponentCtor<B>, c3: ComponentCtor<C>): Iterable<QueryTable3<A, B, C>>;
    public queryTables<A, B, C, D>(c1: ComponentCtor<A>, c2: ComponentCtor<B>, c3: ComponentCtor<C>, c4: ComponentCtor<D>): Iterable<QueryTable4<A, B, C, D>>;
    public queryTables<A, B, C, D, E>(c1: ComponentCtor<A>, c2: ComponentCtor<B>, c3: ComponentCtor<C>, c4: ComponentCtor<D>, c5: ComponentCtor<E>): Iterable<QueryTable5<A, B, C, D, E>>;
    public queryTables<A, B, C, D, E, F>(c1: ComponentCtor<A>, c2: ComponentCtor<B>, c3: ComponentCtor<C>, c4: ComponentCtor<D>, c5: ComponentCtor<E>, c6: ComponentCtor<F>): Iterable<QueryTable6<A, B, C, D, E, F>>;
    public queryTables(...ctors: ComponentCtor<any>[]): Iterable<any>
    {
        const { requested, needSorted } = World._buildQueryTypeIds(ctors);

        function* gen(world: World): IterableIterator<any>
        {
            world._iterateDepth++;
            try {
                for (const a of world.archetypes) {
                    if (!a) continue;
                    if (!signatureHasAll(a.sig, needSorted)) continue;

                    const out: any = { entities: a.entities };
                    for (let i = 0; i < requested.length; i++) {
                        out[`c${i + 1}`] = a.column<any>(requested[i]!);
                    }
                    yield out;
                }
            } finally {
                world._iterateDepth--;
            }
        }

        return gen(this);
    }

    /**
     * Callback query: calls `fn` for each matching entity row (no yield object allocations).
     */
    public queryEach<A>(c1: ComponentCtor<A>, fn: (e: Entity, c1: A) => void): void;
    public queryEach<A, B>(c1: ComponentCtor<A>, c2: ComponentCtor<B>, fn: (e: Entity, c1: A, c2: B) => void): void;
    public queryEach<A, B, C>(c1: ComponentCtor<A>, c2: ComponentCtor<B>, c3: ComponentCtor<C>, fn: (e: Entity, c1: A, c2: B, c3: C) => void): void;
    public queryEach<A, B, C, D>(c1: ComponentCtor<A>, c2: ComponentCtor<B>, c3: ComponentCtor<C>, c4: ComponentCtor<D>, fn: (e: Entity, c1: A, c2: B, c3: C, c4: D) => void): void;
    public queryEach<A, B, C, D, E>(c1: ComponentCtor<A>, c2: ComponentCtor<B>, c3: ComponentCtor<C>, c4: ComponentCtor<D>, c5: ComponentCtor<E>, fn: (e: Entity, c1: A, c2: B, c3: C, c4: D, c5: E) => void): void;
    public queryEach<A, B, C, D, E, F>(c1: ComponentCtor<A>, c2: ComponentCtor<B>, c3: ComponentCtor<C>, c4: ComponentCtor<D>, c5: ComponentCtor<E>, c6: ComponentCtor<F>, fn: (e: Entity, c1: A, c2: B, c3: C, c4: D, c5: E, c6: F) => void): void;
    public queryEach(...args: any[]): void
    {
        // tslint:disable-next-line:ban-types
        const fn = args[args.length - 1] as Function;
        const ctors = args.slice(0, args.length - 1) as ComponentCtor<any>[];

        const { requested, needSorted } = World._buildQueryTypeIds(ctors);

        this._iterateDepth++;
        try {
            for (const a of this.archetypes) {
                if (!a) continue;
                if (!signatureHasAll(a.sig, needSorted)) continue;

                const cols = new Array<any[]>(requested.length);
                for (let i = 0; i < requested.length; i++) cols[i] = a.column<any>(requested[i]!);

                for (let row = 0; row < a.entities.length; row++) {
                    const e = a.entities[row]!;
                    switch (cols.length) {
                        case 1: fn(e, cols[0]![row]); break;
                        case 2: fn(e, cols[0]![row], cols[1]![row]); break;
                        case 3: fn(e, cols[0]![row], cols[1]![row], cols[2]![row]); break;
                        case 4: fn(e, cols[0]![row], cols[1]![row], cols[2]![row], cols[3]![row]); break;
                        case 5: fn(e, cols[0]![row], cols[1]![row], cols[2]![row], cols[3]![row], cols[4]![row]); break;
                        case 6: fn(e, cols[0]![row], cols[1]![row], cols[2]![row], cols[3]![row], cols[4]![row], cols[5]![row]); break;
                        default: fn(e, ...cols.map(c => c[row])); break;
                    }
                }
            }
        } finally {
            this._iterateDepth--;
        }
    }
    //#endregion

    //#region ---------- Internals ----------
    private static _buildQueryTypeIds(ctors: ComponentCtor<any>[]): { requested: TypeId[]; needSorted: TypeId[] }
    {
        // Preserve caller order for (c1,c2,c3,...) mapping.
        const requested: TypeId[] = new Array(ctors.length);
        for (let i = 0; i < ctors.length; i++) requested[i] = typeId(ctors[i]!);

        // Same ids, but sorted + deduped for signatureHasAll().
        const needSorted: TypeId[] = requested.slice();
        needSorted.sort((a, b) => a - b);

        let w = 0;
        for (let i = 0; i < needSorted.length; i++) {
            const v = needSorted[i]!;
            if (i === 0 || v !== needSorted[w - 1]) needSorted[w++] = v;
        }
        needSorted.length = w;

        return { requested, needSorted };
    }

    private _ensureNotIterating(op: string): void
    {
        if (this._iterateDepth > 0) {
            throw new Error(`Cannot do structural change (${op}) while iterating. Use world.cmd() and flush at end of frame.`);
        }
    }

    private _getOrCreateArchetype(sig: Signature): Archetype
    {
        const key = signatureKey(sig);
        const existing = this.archByKey.get(key);
        if (existing) return existing;

        const id = this.archetypes.length;
        const a = new Archetype(id, sig.slice().sort((x, y) => x - y));
        this.archetypes[id] = a;
        this.archByKey.set(key, a);
        return a;
    }

    private _removeFromArchetype(e: Entity): void
    {
        const m = this.entities.meta[e.id]!;
        const a = this.archetypes[m.arch]!;
        const moved = a.removeRow(m.row);
        if (moved) {
            // update moved entity meta to new row
            const mm = this.entities.meta[moved.id]!;
            mm.row = m.row;
        }
    }

    /**
     * Move entity from src archetype row to dst archetype, copying columns via `pick`.
     * Then swap-remove from src.
     */
    private _moveEntity(e: Entity, src: Archetype, srcRow: number, dst: Archetype, pick: (t: TypeId) => any): void
    {
        // add row in dst
        const dstRow = dst.addRow(e);
        for (const t of dst.sig) dst.column<any>(t).push(pick(t));

        // update meta to dst before removing from src (in case src==dst should never happen here)
        const m = this.entities.meta[e.id]!;
        m.arch = dst.id;
        m.row = dstRow;

        // remove from src (swap-remove)
        const moved = src.removeRow(srcRow);
        if (moved) {
            const mm = this.entities.meta[moved.id]!;
            mm.arch = src.id;
            mm.row = srcRow;
        }
    }

    private _apply(op: Command): void
    {
        switch (op.k) {
            case "spawn": {
                const e = this.spawn();
                op.init?.(e);
                return;
            }
            case "despawn":
                return this.despawn(op.e);
            case "add":
                return this.add(op.e, op.ctor, op.value);
            case "remove":
                return this.remove(op.e, op.ctor);
        }
    }

    private _formatEntity(e: Entity): string
    {
        return `e#${e.id}@${e.gen}`;
    }

    private _formatCtor(ctor: ComponentCtor<any>): string
    {
        const n = (ctor as any)?.name;
        return n && n.length > 0 ? n : "<token>";
    }

    /**
     * Throws an error if the entity is not alive
     */
    private _assertAlive(e: Entity, op: string): EntityMeta
    {
        const meta: EntityMeta = this.entities.meta[e.id];
        if (!this.entities.isAlive(e)) {
            const status = meta ? `alive=${meta.alive}, gen=${meta.gen}` : "not found";
            throw new Error(`${op} failed: stale entity ${this._formatEntity(e)} (${status})`);
        }
        return meta;
    }

    private _events<T>(key: ComponentCtor<T>): EventChannel<T>
    {
        let ch = this.eventChannels.get(key);
        if (!ch) {
            ch = new EventChannel<T>();
            this.eventChannels.set(key, ch);
        }
        return ch as EventChannel<T>;
    }

    /**
     * @internal Warns about lifecycle method conflicts in development mode
     */
    public _warnAboutLifecycleConflict(method: "World.update" | "Schedule.run"): void
    {
        const otherMethod = method === "World.update" ? "Schedule.run" : "World.update";
        throw new Error(
            `⚠️  ECS Lifecycle Conflict Detected!\n` +
            `You are using both ${method} and ${otherMethod} on the same World instance.\n` +
            `This can cause:\n` +
            `- Double command flushes\n` +
            `- Confusing event visibility\n` +
            `- Unclear lifecycle semantics\n\n` +
            `Recommended fix:\n` +
            `[- Use World.update() for simple single-phase applications\n](cci:1://file:///home/jdu/Workplace/archetype-ecs-lib/src/ecs/World.ts:59:4-76:5)` +
            `[- Use Schedule.run() for multi-phase applications with explicit control\n\n](cci:1://file:///home/jdu/Workplace/archetype-ecs-lib/src/ecs/Schedule.ts:21:4-57:5)` +
            `Choose ONE approach and stick with it.`
        );
    }
    //#endregion
}