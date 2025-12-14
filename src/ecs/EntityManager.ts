import { Entity, EntityId, EntityMeta } from "./Types";

export class EntityManager
{
    private _nextId: EntityId = 1;
    private _free: EntityId[] = [];
    readonly meta: EntityMeta[] = []; // indexed by EntityId; meta[0] unused

    public create(): Entity
    {
        let id: EntityId;
        if (this._free.length > 0) {
            id = this._free.pop()!;

            const m = this.meta[id]!;
            m.alive = true;
            m.gen += 1; // bump generation on reuse
            m.arch = 0;
            m.row = 0;
            return { id, gen: m.gen };
        }

        id = this._nextId++;
        this.meta[id] = { gen: 1, alive: true, arch: 0, row: 0 };
        return { id, gen: 1 };
    }

    public isAlive(e: Entity): boolean
    {
        const m = this.meta[e.id];
        return !!m && m.alive && m.gen === e.gen;
    }

    public kill(e: Entity): void
    {
        const m = this.meta[e.id];
        if (!m || !m.alive || m.gen !== e.gen) return;
        m.alive = false;
        this._free.push(e.id);
    }
}