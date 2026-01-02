import { Archetype } from "./Archetype";
import { Command, Commands } from "./Commands";
import { EntityManager } from "./EntityManager";
import { mergeSignature, signatureHasAll, signatureKey, subtractSignature } from "./Signature";
import { typeId } from "./TypeRegistry";
import { ComponentCtor, Entity, EntityMeta, Signature, SystemFn, TypeId, WorldI } from "./Types";

export class World implements WorldI
{
    private readonly entities = new EntityManager();

    private readonly archetypes: Archetype[] = [];
    private readonly archByKey = new Map<string, Archetype>();

    private readonly systems: SystemFn[] = [];

    private readonly commands = new Commands();
    private _iterateDepth: number = 0;

    constructor()
    {
        // Archetype 0: empty signature
        const archetype0 = new Archetype(0, []);
        this.archetypes[0] = archetype0;
        this.archByKey.set("", archetype0);
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
     * Run a frame:
     * - run systems in order
     * - flush queued commands (structural changes)
     */
    public update(dt: number): void
    {
        this._iterateDepth++;
        try {
            for (const s of this.systems) s(this, dt);
        } finally {
            this._iterateDepth--;
            this.flush();
        }
    }

    public flush(): void
    {
        this._ensureNotIterating("flush");
        const ops = this.commands.drain();
        for (const op of ops) this._apply(op);
    }

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
        const meta = this._assertAlive(e, `set(${this._formatCtor(ctor)})`);

        const tid = typeId(ctor);
        const a = this.archetypes[meta.arch]!;

        if (!a.has(tid)) throw new Error(`set(${this._formatCtor(ctor)}) requires component to exist on ${this._formatEntity(e)}; use add()`);
        a.column<T>(tid)[meta.row] = value;
    }

    public add<T>(e: Entity, ctor: ComponentCtor<T>, value: T): void
    {
        this._assertAlive(e, `add(${this._formatCtor(ctor)})`);

        this._ensureNotIterating("add");
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

    public remove<T>(e: Entity, ctor: ComponentCtor<T>): void
    {
        this._assertAlive(e, `remove(${this._formatCtor(ctor)})`);
        this._ensureNotIterating("remove");
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
    //#endregion

    //region ---------- Queries ----------
    /**
     * Query all entities having all required component types.
     * Iterates archetypes (tables) and yields SoA columns for cache-friendly loops.
     */
    public query(...ctors: ComponentCtor<any>[]): Iterable<any>
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
    //#endregion

    //#region ---------- Internals ----------
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
            throw new Error(`${op} on stale entity ${this._formatEntity(e)} (alive=${meta?.alive ?? false}, gen=${meta?.gen ?? "n/a"})`);
        }
        return meta;
    }
    //#endregion
}