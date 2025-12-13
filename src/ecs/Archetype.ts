import { Column, Entity, Signature, TypeId } from "./Types";

export class Archetype
{
    readonly id: number;
    readonly sig: Signature;
    // One column per component type id (SoA layout)
    private readonly cols = new Map<TypeId, Column>();
    // Entity handles stored per row
    readonly entities: Entity[] = [];

    constructor(id: number, sig: Signature) {
        this.id = id;
        this.sig = sig;
        for (const t of sig) this.cols.set(t, []);
    }

    /**
     * Adds a new row. The caller must push per-column values in the same order.
     * Returns row index.
     */
    addRow(e: Entity): number {
        const row = this.entities.length;
        this.entities.push(e);
        return row;
    }
}