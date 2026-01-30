
/**
 * @jest-environment jsdom
 */

import { World } from "../src";

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

describe("StatsOverlay", () => {
    let container: HTMLDivElement;
    let world: World;

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
        world?.destroyOverlay();
        container.remove();
    });

    describe("constructor", () => {
        it("creates overlay with default options", () => {
            world = new World();

            const root = document.body.querySelector("div[style*='position: fixed']");
            expect(root).toBeTruthy();
            expect(root?.querySelector("pre")).toBeTruthy();
            expect(root?.querySelector("canvas")).toBeTruthy();
        });

        it("attaches to custom parent element", () => {
            world = new World({ statsOverlayOptions: { parent: container } });

            expect(container.children.length).toBe(1);
            expect(container.querySelector("canvas")).toBeTruthy();
        });

        it("applies custom positioning", () => {
            world = new World({
                statsOverlayOptions: {
                    parent: container,
                    left: 100,
                    top: 50,
                }
            });

            const root = container.firstElementChild as HTMLElement;
            expect(root.style.left).toBe("100px");
            expect(root.style.top).toBe("50px");
        });

        it("applies custom canvas dimensions", () => {
            world = new World({
                statsOverlayOptions: {
                    parent: container,
                    width: 400,
                    height: 100,
                }
            });

            const canvas = container.querySelector("canvas");
            expect(canvas?.style.width).toBe("400px");
            expect(canvas?.style.height).toBe("100px");
        });
    });

    describe("updateOverlay()", () => {
        it("renders stats text correctly", () => {
            world = new World({ statsOverlayOptions: { parent: container } });

            // Run a few updates to set frame counter
            for (let i = 0; i < 123; i++) {
                world.update(0.016);
            }

            const text = container.querySelector("pre")?.textContent;
            expect(text).toContain("Frame 123");
        });

        it("displays all stat fields", () => {
            world = new World({ statsOverlayOptions: { parent: container } });

            world.update(0.016);

            const text = container.querySelector("pre")?.textContent ?? "";
            expect(text).toContain("Archetypes:");
            expect(text).toContain("Rows:");
            expect(text).toContain("Systems:");
            expect(text).toContain("Resources:");
            expect(text).toContain("Event channels:");
            expect(text).toContain("Pending commands:");
        });

        it("displays timing information", () => {
            world = new World({ statsOverlayOptions: { parent: container } });

            world.update(0.0167);

            const text = container.querySelector("pre")?.textContent ?? "";
            expect(text).toContain("dt=");
            expect(text).toContain("frame=");
        });

        it("draws frame graph on canvas", () => {
            world = new World({ statsOverlayOptions: { parent: container } });

            world.update(0.016);

            expect(mockCtx.clearRect).toHaveBeenCalled();
            expect(mockCtx.fillRect).toHaveBeenCalled();
        });
    });

    describe("toggle()", () => {
        it("collapses content when toggle button is clicked", () => {
            world = new World({ statsOverlayOptions: { parent: container } });

            const toggleBtn = container.querySelector("button:last-of-type");
            expect(toggleBtn?.textContent).toBe("−");

            toggleBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

            const content = container.querySelector("div[style*='padding: 0px 8px 8px']") as HTMLElement;
            expect(content?.style.display).toBe("none");
            expect(toggleBtn?.textContent).toBe("+");
        });

        it("expands content when toggle button is clicked again", () => {
            world = new World({ statsOverlayOptions: { parent: container } });

            const toggleBtn = container.querySelector("button:last-of-type");
            toggleBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true })); // collapse
            toggleBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true })); // expand

            const content = container.querySelector("div[style*='padding: 0px 8px 8px']") as HTMLElement;
            expect(content?.style.display).toBe("block");
            expect(toggleBtn?.textContent).toBe("−");
        });
    });

    describe("destroyOverlay()", () => {
        it("removes overlay from DOM", () => {
            world = new World({ statsOverlayOptions: { parent: container } });
            expect(container.children.length).toBe(1);

            world.destroyOverlay();
            expect(container.children.length).toBe(0);
        });

        it("disconnects ResizeObserver", () => {
            world = new World({ statsOverlayOptions: { parent: container } });

            world.destroyOverlay();

            expect(mockDisconnect).toHaveBeenCalled();
        });
    });

    describe("drag functionality", () => {
        it("changes cursor on header mousedown", () => {
            world = new World({ statsOverlayOptions: { parent: container } });

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
            world = new World({ statsOverlayOptions: { parent: container } });

            const header = container.querySelector("div[style*='cursor']") as HTMLElement;
            const toggleBtn = container.querySelector("button:last-of-type") as HTMLElement;

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
            world = new World({
                statsOverlayOptions: {
                    parent: container,
                    targetFrameMs: 33.33, // 30fps
                }
            });

            world.update(0.016);

            // Canvas should be drawn with custom threshold
            expect(mockCtx.fillText).toHaveBeenCalled();
        });

        it("uses custom slowFrameMs threshold", () => {
            world = new World({
                statsOverlayOptions: {
                    parent: container,
                    slowFrameMs: 50,
                }
            });

            world.update(0.016);

            expect(mockCtx.fillRect).toHaveBeenCalled();
        });

        it("limits maxSamples in graph", () => {
            world = new World({
                statsOverlayOptions: {
                    parent: container,
                    maxSamples: 50,
                }
            });

            // Run many updates
            for (let i = 0; i < 100; i++) {
                world.update(0.016);
            }

            // Should only render up to maxSamples bars
            expect(mockCtx.fillRect).toHaveBeenCalled();
        });
    });
});