import type { SystemFn, WorldApi } from "./Types";

/**
 * Minimal multiphase scheduler.
 * Use this when you need explicit control over system execution order and
 * phase-gate event/command propagation.
 *
 * @example
 * schedule.run(world, dt, ['input', 'update', 'render']);
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

    /**
     * Executes systems in the specified phase order.
     * Flushes commands and swaps events at EVERY phase boundary.
     *
     * @note When using this, avoid calling `world.update()`.
     */
    run(world: WorldApi, dt: number, phaseOrder: string[]): void
    {
        for (const phase of phaseOrder) {
            const list = this.phases.get(phase);

            // Run systems only if they exist for this phase
            if (list) {
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
            }

            // Always run phase boundary logic, even if no systems registered
            // apply deferred commands between phases
            if (world.cmd().hasPending()) {
                world.flush();
            }

            // deliver events emitted in this phase to the next phase
            world.swapEvents();
        }
    }
}
