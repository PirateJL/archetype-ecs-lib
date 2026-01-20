import type { SystemFn, WorldApi } from "./Types";

/**
 * Minimal scheduler that supports phases, without borrow-checking.
 * (Add conflict detection later if you want parallelism.)
 */
export class Schedule {
    private readonly phases = new Map<string, SystemFn[]>();

    add(phase: string, fn: SystemFn): this
    {
        const list = this.phases.get(phase) ?? [];
        list.push(fn);
        this.phases.set(phase, list);
        return this;
    }

    run(world: WorldApi, dt: number, phaseOrder: string[]): void
    {
        for (const phase of phaseOrder) {
            const list = this.phases.get(phase);
            if (!list) continue;

            for (const fn of list) {
                try {
                    fn(world, dt);
                } catch (error: any) {
                    const sysName = fn.name && fn.name.length > 0 ? fn.name : "<anonymous>";
                    const msg = error.message !== undefined && typeof error.message === 'string' ?
                        error.message : JSON.stringify(error);
                    const e = new Error(`[phase=${phase} system=${sysName}] ${msg}`);
                    (e as any).cause = error;
                    throw e;
                }
            }

            // apply deferred commands between phases
            if (world.cmd().hasPending()) {
                world.flush();
            }

            // deliver events emitted in this phase to the next phase
            world.swapEvents();
        }
    }
}
