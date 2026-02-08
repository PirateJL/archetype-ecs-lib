import type { Entity, WorldSnapshotAllocator } from "../src";
import { EntityManager } from "../src/ecs/EntityManager";

function expectRestoreError(manager: EntityManager, snapshot: WorldSnapshotAllocator, matcher: RegExp): void
{
    expect(() => manager.restoreAllocator(snapshot)).toThrow(matcher);
}

describe("EntityManager", () => {
    test("create allocates incrementing ids with generation 1", () => {
        const manager = new EntityManager();

        const e1 = manager.create();
        const e2 = manager.create();

        expect(e1).toEqual({ id: 1, gen: 1 });
        expect(e2).toEqual({ id: 2, gen: 1 });
        expect(manager.meta[1]).toEqual({ gen: 1, alive: true, arch: 0, row: 0 });
        expect(manager.meta[2]).toEqual({ gen: 1, alive: true, arch: 0, row: 0 });
    });

    test("create reuses freed id, bumps generation, and resets arch/row", () => {
        const manager = new EntityManager();
        const e1 = manager.create();
        manager.create();

        manager.meta[e1.id]!.arch = 10;
        manager.meta[e1.id]!.row = 20;
        manager.kill(e1);

        const reused = manager.create();

        expect(reused.id).toBe(e1.id);
        expect(reused.gen).toBe(e1.gen + 1);
        expect(manager.meta[e1.id]).toEqual({ gen: 2, alive: true, arch: 0, row: 0 });
    });

    test("isAlive handles missing, dead, stale, and valid handles", () => {
        const manager = new EntityManager();
        const e = manager.create();

        expect(manager.isAlive({ id: 999, gen: 1 })).toBe(false);
        expect(manager.isAlive(e)).toBe(true);

        manager.kill(e);
        expect(manager.isAlive(e)).toBe(false);

        const reused = manager.create();
        expect(manager.isAlive(e)).toBe(false);
        expect(manager.isAlive(reused)).toBe(true);
    });

    test("kill is a no-op for missing/dead/stale handles and works for valid handle", () => {
        const manager = new EntityManager();
        const e = manager.create();

        manager.kill({ id: 777, gen: 1 } as Entity);
        expect(manager.isAlive(e)).toBe(true);

        manager.kill(e);
        expect(manager.isAlive(e)).toBe(false);
        expect(manager.snapshotAllocator().free).toEqual([e.id]);

        manager.kill(e);
        expect(manager.snapshotAllocator().free).toEqual([e.id]);

        const reused = manager.create();
        manager.kill(e);
        expect(manager.isAlive(reused)).toBe(true);
    });

    test("snapshotAllocator returns a copy and skips missing meta holes", () => {
        const manager = new EntityManager();

        manager.restoreAllocator({
            nextId: 4,
            free: [3],
            generations: [[2, 9], [3, 2]]
        });

        const snapshot = manager.snapshotAllocator();
        expect(snapshot).toEqual({
            nextId: 4,
            free: [3],
            generations: [[2, 9], [3, 2]]
        });

        (snapshot.free as number[]).push(1234);
        expect(manager.snapshotAllocator().free).toEqual([3]);
    });

    test("restoreAllocator replaces state and drives future create() deterministically", () => {
        const manager = new EntityManager();
        const e1 = manager.create();
        const e2 = manager.create();
        manager.kill(e1);
        manager.kill(e2);

        manager.restoreAllocator({
            nextId: 3,
            free: [1],
            generations: [[1, 4], [2, 1]]
        });

        expect(manager.meta[1]).toEqual({ gen: 4, alive: false, arch: 0, row: 0 });
        expect(manager.meta[2]).toEqual({ gen: 1, alive: false, arch: 0, row: 0 });

        const reused = manager.create();
        const fresh = manager.create();

        expect(reused).toEqual({ id: 1, gen: 5 });
        expect(fresh).toEqual({ id: 3, gen: 1 });
    });

    test("restoreAllocator validates nextId", () => {
        const manager = new EntityManager();

        expectRestoreError(
            manager,
            { nextId: 1.1 as unknown as number, free: [], generations: [] },
            /Invalid snapshot allocator\.nextId/i
        );

        expectRestoreError(
            manager,
            { nextId: 0, free: [], generations: [] },
            /Invalid snapshot allocator\.nextId/i
        );
    });

    test("restoreAllocator validates generations ids", () => {
        const manager = new EntityManager();

        expectRestoreError(
            manager,
            { nextId: 3, free: [], generations: [[1.2 as unknown as number, 1]] },
            /Invalid snapshot allocator generations id/i
        );

        expectRestoreError(
            manager,
            { nextId: 3, free: [], generations: [[0, 1]] },
            /Invalid snapshot allocator generations id/i
        );

        expectRestoreError(
            manager,
            { nextId: 3, free: [], generations: [[3, 1]] },
            /must be < nextId/i
        );

        expectRestoreError(
            manager,
            { nextId: 4, free: [], generations: [[1, 1], [1, 2]] },
            /Duplicate snapshot allocator generation entry/i
        );
    });

    test("restoreAllocator validates generations values", () => {
        const manager = new EntityManager();

        expectRestoreError(
            manager,
            { nextId: 3, free: [], generations: [[1, 1.5 as unknown as number]] },
            /Invalid snapshot allocator generation for id/i
        );

        expectRestoreError(
            manager,
            { nextId: 3, free: [], generations: [[1, 0]] },
            /Invalid snapshot allocator generation for id/i
        );
    });

    test("restoreAllocator validates free ids", () => {
        const manager = new EntityManager();

        expectRestoreError(
            manager,
            { nextId: 4, free: [1.2 as unknown as number], generations: [[1, 1]] },
            /Invalid snapshot allocator free id/i
        );

        expectRestoreError(
            manager,
            { nextId: 4, free: [0], generations: [[1, 1]] },
            /Invalid snapshot allocator free id/i
        );

        expectRestoreError(
            manager,
            { nextId: 4, free: [4], generations: [[1, 1], [2, 1], [3, 1]] },
            /must be < nextId/i
        );

        expectRestoreError(
            manager,
            { nextId: 4, free: [2], generations: [[1, 1], [3, 1]] },
            /missing generation entry/i
        );

        expectRestoreError(
            manager,
            { nextId: 4, free: [1, 1], generations: [[1, 1], [2, 1], [3, 1]] },
            /Duplicate snapshot allocator free id/i
        );
    });
});
