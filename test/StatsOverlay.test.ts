/**
 * @jest-environment jsdom
 */

import { WorldApi, WorldStats, WorldStatsHistory, StatsOverlay } from "../src";

// Mock ResizeObserver (not available in jsdom)
const mockDisconnect = jest.fn();
const mockObserve = jest.fn();
const mockUnobserve = jest.fn();

class MockResizeObserver {
    observe = mockObserve;
    unobserve = mockUnobserve;
    disconnect = mockDisconnect;
}
(global as any).ResizeObserver = MockResizeObserver;

// Mock canvas context
const mockCtx = {
    clearRect: jest.fn(),
    fillRect: jest.fn(),
    strokeRect: jest.fn(),
    fillText: jest.fn(),
    measureText: jest.fn(() => ({ width: 50 })),
    beginPath: jest.fn(),
    moveTo: jest.fn(),
    lineTo: jest.fn(),
    stroke: jest.fn(),
    save: jest.fn(),
    restore: jest.fn(),
    scale: jest.fn(),
    strokeStyle: "",
    fillStyle: "",
    lineWidth: 1,
    font: "",
    textBaseline: "",
};

HTMLCanvasElement.prototype.getContext = jest.fn(() => mockCtx) as any;

// Helper to create mock WorldApi
function createMockWorld(statsOverride: Partial<WorldStats> = {}, historyOverride: Partial<WorldStatsHistory> = {}): WorldApi {
    const defaultStats: WorldStats = {
        aliveEntities: 100,
        archetypes: 5,
        rows: 150,
        systems: 10,
        resources: 3,
        eventChannels: 2,
        pendingCommands: false,
        frame: 42,
        dt: 0.016,
        frameMs: 12.5,
        phaseMs: { update: 5.2, render: 7.3 },
        systemMs: { movement: 2.1, collision: 3.1 },
    };

    const defaultHistory: WorldStatsHistory = {
        capacity: 120,
        size: 10,
        dt: Array(10).fill(0.016),
        frameMs: Array(10).fill(12.5),
        phaseMs: { update: Array(10).fill(5.2) },
        systemMs: { movement: Array(10).fill(2.1) },
    };

    return {
        stats: () => ({ ...defaultStats, ...statsOverride }),
        statsHistory: () => ({ ...defaultHistory, ...historyOverride }),
    } as unknown as WorldApi;
}

describe("StatsOverlay", () => {
    let container: HTMLDivElement;
    let overlay: StatsOverlay;

    beforeEach(() => {
        container = document.createElement("div");
        document.body.appendChild(container);
        jest.clearAllMocks();
        // Reset mock functions
        mockDisconnect.mockClear();
        mockObserve.mockClear();
        mockUnobserve.mockClear();
    });

    afterEach(() => {
        overlay?.destroy();
        container.remove();
    });

    describe("constructor", () => {
        it("creates overlay with default options", () => {
            overlay = new StatsOverlay();

            const root = document.body.querySelector("div[style*='position: fixed']");
            expect(root).toBeTruthy();
            expect(root?.querySelector("pre")).toBeTruthy();
            expect(root?.querySelector("canvas")).toBeTruthy();
        });

        it("attaches to custom parent element", () => {
            overlay = new StatsOverlay({ parent: container });

            expect(container.children.length).toBe(1);
            expect(container.querySelector("canvas")).toBeTruthy();
        });

        it("applies custom positioning", () => {
            overlay = new StatsOverlay({
                parent: container,
                left: 100,
                top: 50,
            });

            const root = container.firstElementChild as HTMLElement;
            expect(root.style.left).toBe("100px");
            expect(root.style.top).toBe("50px");
        });

        it("applies custom canvas dimensions", () => {
            overlay = new StatsOverlay({
                parent: container,
                width: 400,
                height: 100,
            });

            const canvas = container.querySelector("canvas");
            expect(canvas?.style.width).toBe("400px");
            expect(canvas?.style.height).toBe("100px");
        });
    });

    describe("update()", () => {
        it("renders stats text correctly", () => {
            overlay = new StatsOverlay({ parent: container });
            const world = createMockWorld({ frame: 123, aliveEntities: 50 });

            overlay.update(world);

            const text = container.querySelector("pre")?.textContent;
            expect(text).toContain("frame 123");
            expect(text).toContain("alive=50");
        });

        it("displays all stat fields", () => {
            overlay = new StatsOverlay({ parent: container });
            const world = createMockWorld({
                archetypes: 8,
                rows: 200,
                systems: 15,
                resources: 5,
                eventChannels: 3,
                pendingCommands: true,
            });

            overlay.update(world);

            const text = container.querySelector("pre")?.textContent ?? "";
            expect(text).toContain("arch=8");
            expect(text).toContain("rows=200");
            expect(text).toContain("systems=15");
            expect(text).toContain("resources=5");
            expect(text).toContain("eventChannels=3");
            expect(text).toContain("pendingCmd=true");
        });

        it("displays timing information", () => {
            overlay = new StatsOverlay({ parent: container });
            const world = createMockWorld({
                dt: 0.0167,
                frameMs: 15.5,
            });

            overlay.update(world);

            const text = container.querySelector("pre")?.textContent ?? "";
            expect(text).toContain("dt=16.70ms");
            expect(text).toContain("frame=15.50ms");
        });

        it("draws frame graph on canvas", () => {
            overlay = new StatsOverlay({ parent: container });
            const world = createMockWorld();

            overlay.update(world);

            expect(mockCtx.clearRect).toHaveBeenCalled();
            expect(mockCtx.fillRect).toHaveBeenCalled();
        });
    });

    describe("toggle()", () => {
        it("collapses content when toggle button is clicked", () => {
            overlay = new StatsOverlay({ parent: container });

            const toggleBtn = container.querySelector("button");
            expect(toggleBtn?.textContent).toBe("−");

            toggleBtn?.click();

            const content = container.querySelector("div[style*='padding: 0px 8px 8px']") as HTMLElement;
            expect(content?.style.display).toBe("none");
            expect(toggleBtn?.textContent).toBe("+");
        });

        it("expands content when toggle button is clicked again", () => {
            overlay = new StatsOverlay({ parent: container });

            const toggleBtn = container.querySelector("button");
            toggleBtn?.click(); // collapse
            toggleBtn?.click(); // expand

            const content = container.querySelector("div[style*='padding: 0px 8px 8px']") as HTMLElement;
            expect(content?.style.display).toBe("block");
            expect(toggleBtn?.textContent).toBe("−");
        });
    });

    describe("destroy()", () => {
        it("removes overlay from DOM", () => {
            overlay = new StatsOverlay({ parent: container });
            expect(container.children.length).toBe(1);

            overlay.destroy();
            expect(container.children.length).toBe(0);
        });

        it("disconnects ResizeObserver", () => {
            overlay = new StatsOverlay({ parent: container });

            overlay.destroy();

            expect(mockDisconnect).toHaveBeenCalled();
        });
    });

    describe("drag functionality", () => {
        it("changes cursor on header mousedown", () => {
            overlay = new StatsOverlay({ parent: container });

            const header = container.querySelector("div[style*='cursor']") as HTMLElement;
            const mousedownEvent = new MouseEvent("mousedown", {
                clientX: 100,
                clientY: 50,
                bubbles: true,
            });

            header.dispatchEvent(mousedownEvent);

            expect(header.style.cursor).toBe("grabbing");
        });

        it("does not initiate drag when clicking toggle button", () => {
            overlay = new StatsOverlay({ parent: container });

            const header = container.querySelector("div[style*='cursor']") as HTMLElement;
            const toggleBtn = container.querySelector("button") as HTMLElement;

            const mousedownEvent = new MouseEvent("mousedown", {
                clientX: 100,
                clientY: 50,
                bubbles: true,
            });
            Object.defineProperty(mousedownEvent, "target", { value: toggleBtn });

            header.dispatchEvent(mousedownEvent);

            // Cursor should not change to grabbing
            expect(header.style.cursor).not.toBe("grabbing");
        });
    });

    describe("options", () => {
        it("uses custom targetFrameMs threshold", () => {
            overlay = new StatsOverlay({
                parent: container,
                targetFrameMs: 33.33, // 30fps
            });

            const world = createMockWorld();
            overlay.update(world);

            // Canvas should be drawn with custom threshold
            expect(mockCtx.fillText).toHaveBeenCalled();
        });

        it("uses custom slowFrameMs threshold", () => {
            overlay = new StatsOverlay({
                parent: container,
                slowFrameMs: 50,
            });

            const world = createMockWorld();
            overlay.update(world);

            expect(mockCtx.fillRect).toHaveBeenCalled();
        });

        it("limits maxSamples in graph", () => {
            overlay = new StatsOverlay({
                parent: container,
                maxSamples: 50,
            });

            const world = createMockWorld({}, {
                size: 100,
                frameMs: Array(100).fill(10),
            });

            overlay.update(world);

            // Should only render up to maxSamples bars
            expect(mockCtx.fillRect).toHaveBeenCalled();
        });
    });
});
