import { Archetype } from "./Archetype";
import { EntityManager } from "./EntityManager";
import { Entity } from "./Types";

export class World
{
    private readonly entities = new EntityManager();

    private readonly archetypes: Archetype[] = [];
    private readonly archByKey = new Map<string, Archetype>();

    private _isIterating = false;

    constructor() {
        // Archetype 0: empty signature
        const archetype0 = new Archetype(0, []);
        this.archetypes[0] = archetype0;
        this.archByKey.set("", archetype0);
    }

    //#region ---------- Entity lifecycle ----------
    spawn(): Entity
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

    isAlive(e: Entity): boolean
    {
        return this.entities.isAlive(e);
    }

    despawn(e: Entity): void {
        if (!this.entities.isAlive(e)) return;
        this._ensureNotIterating("despawn");
        this._removeFromArchetype(e);
        this.entities.kill(e);
        console.log(this.entities);
    }
    //#endregion

    //#region ---------- Internals ----------
    private _ensureNotIterating(op: string): void {
        if (this._isIterating) {
            throw new Error(`Cannot do structural change (${op}) while iterating. Use world.cmd() and flush at end of frame.`);
        }
    }

    private _removeFromArchetype(e: Entity): void {
        const m = this.entities.meta[e.id]!;
        const a = this.archetypes[m.arch]!;
        const moved = a.removeRow(m.row);
        if (moved) {
            // update moved entity meta to new row
            const mm = this.entities.meta[moved.id]!;
            mm.row = m.row;
        }
    }
    //#endregion
}