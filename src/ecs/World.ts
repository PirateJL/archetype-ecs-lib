import { Archetype } from "./Archetype";
import { EntityManager } from "./EntityManager";
import { Entity } from "./Types";

export class World
{
    private readonly entities = new EntityManager();

    private readonly archetypes: Archetype[] = [];
    private readonly archByKey = new Map<string, Archetype>();

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
    //#endregion
}