import type { Entity, EntityId, EntityMeta, WorldSnapshotAllocator } from "./Types";

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

    public snapshotAllocator(): WorldSnapshotAllocator
    {
        const generations: Array<readonly [EntityId, number]> = [];
        for (let id = 1; id < this.meta.length; id++) {
            const m = this.meta[id];
            if (!m) continue;
            generations.push([id, m.gen]);
        }

        return {
            nextId: this._nextId,
            free: this._free.slice(),
            generations
        };
    }

    public restoreAllocator(snapshot: WorldSnapshotAllocator): void
    {
        if (!Number.isInteger(snapshot.nextId) || snapshot.nextId < 1) {
            throw new Error(`Invalid snapshot allocator.nextId: ${snapshot.nextId}`);
        }

        const seenGenerations = new Set<EntityId>();
        this.meta.length = 0;

        for (const entry of snapshot.generations) {
            const id = entry[0];
            const gen = entry[1];

            if (!Number.isInteger(id) || id <= 0) {
                throw new Error(`Invalid snapshot allocator generations id: ${id}`);
            }
            if (!Number.isInteger(gen) || gen <= 0) {
                throw new Error(`Invalid snapshot allocator generation for id ${id}: ${gen}`);
            }
            if (id >= snapshot.nextId) {
                throw new Error(`Invalid snapshot allocator generation id ${id}: must be < nextId (${snapshot.nextId})`);
            }
            if (seenGenerations.has(id)) {
                throw new Error(`Duplicate snapshot allocator generation entry for id ${id}`);
            }

            seenGenerations.add(id);
            this.meta[id] = { gen, alive: false, arch: 0, row: 0 };
        }

        const seenFree = new Set<EntityId>();
        for (const id of snapshot.free) {
            if (!Number.isInteger(id) || id <= 0) {
                throw new Error(`Invalid snapshot allocator free id: ${id}`);
            }
            if (id >= snapshot.nextId) {
                throw new Error(`Invalid snapshot allocator free id ${id}: must be < nextId (${snapshot.nextId})`);
            }
            if (!seenGenerations.has(id)) {
                throw new Error(`Invalid snapshot allocator free id ${id}: missing generation entry`);
            }
            if (seenFree.has(id)) {
                throw new Error(`Duplicate snapshot allocator free id ${id}`);
            }
            seenFree.add(id);
        }

        this._nextId = snapshot.nextId;
        this._free = snapshot.free.slice();
    }
}
