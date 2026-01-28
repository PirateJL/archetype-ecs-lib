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
    private phaseOrder: string[] | undefined = undefined;
    private boundaryMode: "auto" | "manual" = "auto";

    /** Set a default phase order used when calling `run(world, dt)` without an explicit list. */
    setOrder(phases: string[]): this
    {
        this.phaseOrder = phases.slice();
        return this;
    }

    /**
     * Control what happens at phase boundaries.
     * - "auto" (default): flush commands if pending, then swap event buffers.
     * - "manual": do nothing (caller is responsible for `world.flush()` / `world.swapEvents()`).
     */
    setBoundaryMode(mode: "auto" | "manual"): this
    {
        this.boundaryMode = mode;
        return this;
    }

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
    run(world: WorldApi, dt: number, phaseOrder?: string[]): void
    {
        // Runtime conflict detection (cast to access private fields)
        const worldInstance = world as World;
        if (worldInstance._hasUsedWorldUpdate) {
            worldInstance._warnAboutLifecycleConflict("Schedule.run");
        }
        worldInstance._hasUsedScheduleRun = true;
          
        const phases = phaseOrder ?? this.phaseOrder;
        if (!phases) throw new Error('Schedule.run requires a phase order (pass it as an argument or call schedule.setOrder([...]))');

        for (const phase of phases) {
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

            if (this.boundaryMode !== "manual") {
                // apply deferred commands between phases
                if (world.cmd().hasPending()) {
                    world.flush();
                }

                // deliver events emitted in this phase to the next phase
                world.swapEvents();
            }
        }
    }
}
