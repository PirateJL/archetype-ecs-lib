import type { Column, Entity, Signature, TypeId } from "./Types";

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
    public addRow(e: Entity): number {
        const row = this.entities.length;
        this.entities.push(e);
        return row;
    }

    /**
     * Swap-remove a row (O(1)). Returns the entity that moved into `row`, or null if none.
     */
    public removeRow(row: number): Entity | null {
        const last = this.entities.length - 1;

        if (row < 0 || row > last) throw new Error(`removeRow out of range: ${row}`);

        if (row !== last) {
            const moved = this.entities[last];
            this.entities[row] = moved;
            this.entities.pop();

            for (const [_, col] of this.cols) {
                col[row] = col[last]!;
                col.pop();
            }
            return moved;
        }

        // removing last
        this.entities.pop();
        for (const [, col] of this.cols) col.pop();
        return null;
    }

    public has(t: TypeId): boolean
    {
        return this.cols.has(t);
    }

    public column<T>(t: TypeId): Column<T> {
        const c = this.cols.get(t);
        if (!c) throw new Error(`Archetype ${this.id} missing column for type ${t}`);
        return c as Column<T>;
    }
}