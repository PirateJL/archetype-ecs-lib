import type { SystemFn, WorldApi } from "./Types";
import { World } from "./World";

/**
 * Minimal multiphase scheduler for running ECS systems in named "phases".
 *
 * ## What it does
 * - Group systems by phase name (e.g. `"input"`, `"update"`, `"render"`).
 * - Executes phases in a chosen order.
 * - Optionally performs **phase-boundary work** (flush commands and swap events).
 * - Supports **ordering constraints** between phases via `.after()` / `.before()`.
 *
 * ## Phase boundaries
 * By default (`boundaryMode = "auto"`), after each phase:
 * - if `world.cmd().hasPending()` → `world.flush()`
 * - `world.swapEvents()` so events emitted in this phase become visible to the next phase
 *
 * Use `"manual"` boundary mode if you want to control flush/event delivery yourself.
 *
 * @example
 * ```ts
 * const schedule = new Schedule();
 *
 * schedule
 *   .add("input", inputSystem)
 *   .add("sim", simSystem).after("input")
 *   .add("render", renderSystem).after("sim");
 *
 * // Either pass an explicit phase list...
 * schedule.run(world, dt, ["input", "sim", "render"]);
 *
 * // ...or omit it and let constraints drive the order:
 * // schedule.run(world, dt);
 * ```
 */
export class Schedule {
    private readonly phases = new Map<string, SystemFn[]>();
    private phaseOrder: string[] | undefined = undefined;
    private boundaryMode: "auto" | "manual" = "auto";

    /**
     * Phase ordering constraints stored as edges `before -> after`.
     * Example: calling `after("input")` for phase `"sim"` records `input -> sim`.
     */
    private readonly phaseEdges = new Map<string, Set<string>>();

    /**
     * Tracks the most recently modified phase (via add()) so `.after()`/`.before()` can be chained.
     */
    private _lastPhase: string | undefined = undefined;

    /**
     * Set a default phase order used when calling `run(world, dt)` without passing `phaseOrder`.
     *
     * @param phases Ordered list of phase names to execute.
     */
    setOrder(phases: string[]): this
    {
        this.phaseOrder = phases.slice();
        return this;
    }

    /**
     * Control what happens at phase boundaries.
     *
     * - `"auto"` (default): flush deferred commands (if pending) and swap event buffers after each phase.
     * - `"manual"`: do nothing automatically; the caller is responsible for `world.flush()` / `world.swapEvents()`.
     *
     * @param mode Boundary behavior.
     */
    setBoundaryMode(mode: "auto" | "manual"): this
    {
        this.boundaryMode = mode;
        return this;
    }

    /**
     * Add a system function to a phase.
     *
     * The returned object allows you to attach **phase ordering constraints**:
     * - `.after("input")` means this phase must run after `"input"`.
     * - `.before("render")` means this phase must run before `"render"`.
     *
     * Constraints are **phase-level**, not system-level: they affect the relative order of phases, not
     * the order of systems within the same phase.
     *
     * @param phase Phase name.
     * @param fn System function `(world, dt) => void`.
     */
    add(phase: string, fn: SystemFn): { after: (otherPhase: string) => Schedule; before: (otherPhase: string) => Schedule; }
    {
        const list = this.phases.get(phase) ?? [];
        list.push(fn);
        this.phases.set(phase, list);
        this._lastPhase = phase;
        return this;
    }

    /**
     * Constrain the last added phase to run after `otherPhase`.
     *
     * Must be called after `add(...)`.
     */
    after(otherPhase: string): this
    {
        if (!this._lastPhase) {
            throw new Error(`Schedule.after("${otherPhase}") must be called after schedule.add(phase, fn).`);
        }
        this._addPhaseConstraint(otherPhase, this._lastPhase);
        return this;
    }

    /**
     * Constrain the last added phase to run before `otherPhase`.
     *
     * Must be called after `add(...)`.
     */
    before(otherPhase: string): this
    {
        if (!this._lastPhase) {
            throw new Error(`Schedule.before("${otherPhase}") must be called after schedule.add(phase, fn).`);
        }
        this._addPhaseConstraint(this._lastPhase, otherPhase);
        return this;
    }

    /**
     * Execute all scheduled systems for the given frame.
     *
     * Phase order selection:
     * 1) If `phaseOrder` is provided, it is used as-is.
     * 2) Else if `setOrder()` was called, the stored order is used.
     * 3) Else an order is computed from `.after()`/`.before()` constraints.
     *
     * @param world World instance (API) passed to each system.
     * @param dt Delta time in seconds.
     * @param phaseOrder Optional explicit phase order for this run.
     *
     * @throws If both `Schedule.run()` and `World.update()` are used on the same World instance.
     * @throws If phase constraints contain a cycle and no explicit order is provided.
     * @throws Re-throws system errors, wrapped with `[phase=... system=...]` context.
     *
     * @note When using `Schedule`, avoid calling `world.update()` on the same World instance.
     */
    run(world: WorldApi, dt: number, phaseOrder?: string[]): void
    {
        // Runtime conflict detection (cast to access private fields)
        const worldInstance = world as World;
        if (worldInstance._hasUsedWorldUpdate) {
            worldInstance._warnAboutLifecycleConflict("Schedule.run");
        }
        worldInstance._hasUsedScheduleRun = true;

        const phases = phaseOrder ?? this.phaseOrder ??  this._computePhaseOrder();
        if (!phases || phases.length === 0)
            throw new Error('Schedule.run requires a phase order (pass it as an argument or call schedule.setOrder([...]))');
        
        const frameStart = worldInstance._profBeginFrame(dt);

        for (const phase of phases) {
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

            if (this.boundaryMode !== "manual") {
                // apply deferred commands between phases
                if (world.cmd().hasPending()) {
                    world.flush();
                }

                // deliver events emitted in this phase to the next phase
                world.swapEvents();
            }
          
          worldInstance._profAddPhase(phase, performance.now() - phaseStart);
        }
      worldInstance._profEndFrame(frameStart);
    }

    /**
     * Record a phase ordering constraint `before -> after`.
     *
     * @param before Phase that must execute first.
     * @param after Phase that must execute later.
     *
     * @throws If `before === after`.
     * @internal
     */
    private _addPhaseConstraint(before: string, after: string): void
    {
        if (before === after) {
            throw new Error(`Invalid phase constraint: "${before}" cannot be before/after itself.`);
        }
        let outs = this.phaseEdges.get(before);
        if (!outs) {
            outs = new Set<string>();
            this.phaseEdges.set(before, outs);
        }
        outs.add(after);
    }

    /**
     * Compute a phase order from the currently registered constraints.
     *
     * Uses a stable topological sort:
     * - phases explicitly registered via `add()` keep insertion order when unconstrained
     * - remaining ties fall back to lexicographic order
     *
     * @returns A valid phase order that satisfies all constraints.
     * @throws If constraints contain a cycle.
     * @internal
     */
    private _computePhaseOrder(): string[]
    {
        // Collect all known phases (defined or referenced by constraints)
        const all = new Set<string>();
        for (const k of this.phases.keys()) all.add(k);
        for (const [a, bs] of this.phaseEdges) {
            all.add(a);
            for (const b of bs) all.add(b);
        }

        // Stable tie-breaker: insertion order of phase registration (then lexicographic fallback)
        const stableRank = new Map<string, number>();
        let r = 0;
        for (const k of this.phases.keys()) stableRank.set(k, r++);

        const rank = (p: string): number => stableRank.get(p) ?? Number.MAX_SAFE_INTEGER;

        // Build indegree + adjacency
        const indeg = new Map<string, number>();
        const adj = new Map<string, Set<string>>();
        for (const p of all) {
            indeg.set(p, 0);
            adj.set(p, new Set<string>());
        }
        for (const [a, bs] of this.phaseEdges) {
            const _out = adj.get(a)!;
            for (const b of bs) {
                if (!_out.has(b)) {
                    _out.add(b);
                    indeg.set(b, (indeg.get(b) ?? 0) + 1);
                }
            }
        }

        // Kahn's algorithm with stable ordering
        const ready: string[] = [];
        for (const [p, d] of indeg) {
            if (d === 0) ready.push(p);
        }
        ready.sort((x, y) => rank(x) - rank(y) || x.localeCompare(y));

        const out: string[] = [];
        while (ready.length > 0) {
            const p = ready.shift()!;
            out.push(p);

            for (const q of adj.get(p)!) {
                const nd = (indeg.get(q) ?? 0) - 1;
                indeg.set(q, nd);
                if (nd === 0) {
                    ready.push(q);
                    ready.sort((x, y) => rank(x) - rank(y) || x.localeCompare(y));
                }
            }
        }

        if (out.length !== all.size) {
            // Find a cycle-friendly message
            const stuck = [...all].filter(p => (indeg.get(p) ?? 0) > 0).sort();
            throw new Error(
                `Schedule phase constraints contain a cycle (cannot compute order). ` +
                `Phases involved: ${stuck.join(", ")}`
            );
        }

        return out;
    }
}
