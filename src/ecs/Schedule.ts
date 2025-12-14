import type { SystemFn, WorldI } from "./Types";

/**
 * Minimal scheduler that supports phases, without borrow-checking.
 * (Add conflict detection later if you want parallelism.)
 */
export class Schedule {
    private readonly phases = new Map<string, SystemFn[]>();

    add(phase: string, fn: SystemFn): this {
        const list = this.phases.get(phase) ?? [];
        list.push(fn);
        this.phases.set(phase, list);
        return this;
    }

    run(world: WorldI, dt: number, phaseOrder: string[]): void {
        for (const phase of phaseOrder) {
            const list = this.phases.get(phase);
            if (!list) continue;
            for (const fn of list) fn(world, dt);
            // apply deferred commands between phases
            world.flush();
        }
    }
}
