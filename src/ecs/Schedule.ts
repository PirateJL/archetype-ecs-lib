import type { SystemFn, WorldApi } from "./Types";
import { World } from "./World";

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
        // Runtime conflict detection (cast to access private fields)
        const worldInstance = world as World;
        if (worldInstance._hasUsedWorldUpdate) {
            worldInstance._warnAboutLifecycleConflict("Schedule.run");
        }
        worldInstance._hasUsedScheduleRun = true;

        const frameStart = worldInstance._profBeginFrame(dt);

        for (const phase of phaseOrder) {
            const phaseStart = performance.now();
            const list = this.phases.get(phase);

            // Run systems only if they exist for this phase
            if (list) {
                for (const fn of list) {
                    const sysStart = performance.now();
                    try {
                        fn(world, dt);
                    } catch (error: any) {
                        const sysName = fn.name && fn.name.length > 0 ? fn.name : "<anonymous>";
                        const msg = error.message !== undefined && typeof error.message === 'string' ?
                            error.message : JSON.stringify(error);
                        const e = new Error(`[phase=${phase} system=${sysName}] ${msg}`);
                        (e as any).cause = error;
                        throw e;
                    } finally {
                        const sysName = fn.name && fn.name.length > 0 ? fn.name : "<anonymous>";
                        worldInstance._profAddSystem(`${phase}:${sysName}`, performance.now() - sysStart);
                    }
                }
            }

            // Always run phase boundary logic, even if no systems registered
            if (world.cmd().hasPending()) {
                world.flush();
            }

            // deliver events emitted in this phase to the next phase
            world.swapEvents();

            worldInstance._profAddPhase(phase, performance.now() - phaseStart);
        }

        worldInstance._profEndFrame(frameStart);
    }
}
