/**
 * Benchmark suite for archetype-ecs-lib.
 *
 * Run with: npm run bench
 *
 * Results are printed as a table after all benchmarks complete.
 * Tests always pass; they exist to establish baseline numbers in CI.
 */

import { World, Entity } from "../src";

// ---------------------------------------------------------------------------
// Mock components
// ---------------------------------------------------------------------------

class Position { constructor(public x: number, public y: number) {} }
class Velocity { constructor(public vx: number, public vy: number) {} }
class Health   { constructor(public hp: number) {} }

// ---------------------------------------------------------------------------
// Result collection
// ---------------------------------------------------------------------------

interface BenchResult { label: string; n: number; ms: number; ops: number; }
const results: BenchResult[] = [];

function run(label: string, n: number, fn: () => void): void {
    fn(); // warmup
    const t0 = performance.now();
    fn();
    const ms = performance.now() - t0;
    results.push({ label, n, ms, ops: Math.round(n / ms * 1_000) });
}

function printTable(rows: BenchResult[]): void {
    const COL_LABEL = "Benchmark";
    const COL_N     = "N";
    const COL_MS    = "ms";
    const COL_OPS   = "ops/s";

    const wLabel = Math.max(COL_LABEL.length, ...rows.map(r => r.label.length));
    const wN     = Math.max(COL_N.length,     ...rows.map(r => r.n.toLocaleString().length));
    const wMs    = Math.max(COL_MS.length,    ...rows.map(r => r.ms.toFixed(1).length));
    const wOps   = Math.max(COL_OPS.length,   ...rows.map(r => r.ops.toLocaleString().length));

    const sep = `+${"-".repeat(wLabel + 2)}+${"-".repeat(wN + 2)}+${"-".repeat(wMs + 2)}+${"-".repeat(wOps + 2)}+`;

    const header =
        `| ${COL_LABEL.padEnd(wLabel)} | ${COL_N.padStart(wN)} | ${COL_MS.padStart(wMs)} | ${COL_OPS.padStart(wOps)} |`;

    const lines = [sep, header, sep];
    for (const r of rows) {
        lines.push(
            `| ${r.label.padEnd(wLabel)} | ${r.n.toLocaleString().padStart(wN)} | ${r.ms.toFixed(1).padStart(wMs)} | ${r.ops.toLocaleString().padStart(wOps)} |`
        );
    }
    lines.push(sep);
    console.log("\n" + lines.join("\n") + "\n");
}

// ---------------------------------------------------------------------------
// Benchmarks
// ---------------------------------------------------------------------------

describe("Benchmarks", () => {

    afterAll(() => printTable(results));

    it("spawn throughput: 50k entities (no components)", () => {
        const N = 50_000;
        run(`spawn x${N}`, N, () => {
            const w = new World();
            for (let i = 0; i < N; i++) w.spawn();
        });
    });

    it("spawn + add 2 components: 50k entities", () => {
        const N = 50_000;
        run(`spawn + add(Pos,Vel) x${N}`, N, () => {
            const w = new World();
            for (let i = 0; i < N; i++) {
                const e = w.spawn();
                w.add(e, Position, new Position(i, i));
                w.add(e, Velocity, new Velocity(1, 0));
            }
        });
    });

    it("spawnMany (bundle) 2 components: 50k entities", () => {
        const N = 50_000;
        run(`spawnMany([Pos,Vel]) x${N}`, N, () => {
            const w = new World();
            for (let i = 0; i < N; i++) {
                w.spawnMany([Position, new Position(i, i)], [Velocity, new Velocity(1, 0)]);
            }
        });
    });

    it("component add/remove cycle: 20k entities (exercises archetype edge cache)", () => {
        const N = 20_000;
        const w = new World();
        const entities: Entity[] = [];
        for (let i = 0; i < N; i++) {
            entities.push(w.spawnMany([Position, new Position(i, i)], [Velocity, new Velocity(1, 0)]));
        }

        run(`add+remove Health x${N}`, N, () => {
            for (const e of entities) w.add(e, Health, new Health(100));
            for (const e of entities) w.remove(e, Health);
        });
    });

    it("query() iteration: 50k entities, 2 components", () => {
        const N = 50_000;
        const w = new World();
        for (let i = 0; i < N; i++) {
            w.spawnMany([Position, new Position(i, i)], [Velocity, new Velocity(1, 0)]);
        }

        run(`query(Pos,Vel) x${N}`, N, () => {
            let sum = 0;
            for (const { c1 } of w.query(Position, Velocity)) sum += c1.x;
            if (sum < 0) throw new Error("prevent dead-code elimination");
        });
    });

    it("queryTables() iteration: 50k entities, 2 components", () => {
        const N = 50_000;
        const w = new World();
        for (let i = 0; i < N; i++) {
            w.spawnMany([Position, new Position(i, i)], [Velocity, new Velocity(1, 0)]);
        }

        run(`queryTables(Pos,Vel) x${N}`, N, () => {
            let sum = 0;
            for (const { c1, entities } of w.queryTables(Position, Velocity)) {
                for (let r = 0; r < entities.length; r++) sum += c1[r]!.x;
            }
            if (sum < 0) throw new Error("prevent dead-code elimination");
        });
    });

    it("queryEach() iteration: 50k entities, 2 components", () => {
        const N = 50_000;
        const w = new World();
        for (let i = 0; i < N; i++) {
            w.spawnMany([Position, new Position(i, i)], [Velocity, new Velocity(1, 0)]);
        }

        run(`queryEach(Pos,Vel) x${N}`, N, () => {
            let sum = 0;
            w.queryEach(Position, Velocity, (_e, pos) => { sum += pos.x; });
            if (sum < 0) throw new Error("prevent dead-code elimination");
        });
    });

    it("query() cache hit: repeated query same signature (10 frames)", () => {
        const N = 50_000;
        const FRAMES = 10;
        const w = new World();
        for (let i = 0; i < N; i++) {
            w.spawnMany([Position, new Position(i, i)], [Velocity, new Velocity(1, 0)]);
        }

        run(`query(Pos,Vel) x${N} x${FRAMES} frames`, N * FRAMES, () => {
            let sum = 0;
            for (let f = 0; f < FRAMES; f++) {
                for (const { c1 } of w.query(Position, Velocity)) sum += c1.x;
            }
            if (sum < 0) throw new Error("prevent dead-code elimination");
        });
    });

    it("mixed archetypes: query across 4 archetype variants, 50k total", () => {
        const N = 50_000;
        const w = new World();
        for (let i = 0; i < N / 4; i++) {
            w.spawnMany([Position, new Position(i, i)], [Velocity, new Velocity(1, 0)]);
            w.spawnMany([Position, new Position(i, i)], [Velocity, new Velocity(1, 0)], [Health, new Health(100)]);
            w.spawnMany([Position, new Position(i, i)], [Health, new Health(100)]);
            w.spawnMany([Position, new Position(i, i)]);
        }

        run(`queryEach(Pos) across 4 archetypes x${N}`, N, () => {
            let sum = 0;
            w.queryEach(Position, (_e, pos) => { sum += pos.x; });
            if (sum < 0) throw new Error("prevent dead-code elimination");
        });
    });

    it("despawn throughput: 20k entities", () => {
        const N = 20_000;
        run(`despawn x${N}`, N, () => {
            const w = new World();
            const es: Entity[] = [];
            for (let i = 0; i < N; i++) es.push(w.spawnMany([Position, new Position(i, i)]));
            for (const e of es) w.despawn(e);
        });
    });
});
