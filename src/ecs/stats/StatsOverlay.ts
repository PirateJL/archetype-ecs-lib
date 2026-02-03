import type { WorldStats, WorldStatsHistory } from "../Types";

export type StatsOverlayOptions = Readonly<{
    /** Parent element to attach the overlay to. Defaults to document.body */
    parent?: HTMLElement;

    /** Fixed positioning offsets */
    left?: number;
    top?: number;

    /** Canvas size */
    width?: number;
    height?: number;

    /** Target frame timeline (ms). Defaults to 16.67 (60fps). */
    targetFrameMs?: number;

    /** Threshold where bars become "slow" (ms). Defaults to 20. */
    slowFrameMs?: number;

    /** How many history samples to render (uses world history capacity). */
    maxSamples?: number;
}>;

export class StatsOverlay
{
    private root: HTMLDivElement | null = null;
    private header: HTMLDivElement | null = null;
    private toggleButton: HTMLButtonElement | null = null;
    private debugToggleButton: HTMLButtonElement | null = null;
    private content: HTMLDivElement | null = null;
    private text: HTMLPreElement | null = null;
    private canvas: HTMLCanvasElement | null = null;
    private ctx: CanvasRenderingContext2D | null = null;

    private opts: Required<Omit<StatsOverlayOptions, "parent">> & { parent: HTMLElement | null };
    private resizeObserver: ResizeObserver | null = null;
    private isExpanded: boolean = true;
    private debugLoggingEnabled: boolean = false;
    private isInitialized: boolean = false;
    private debugingEnabled: boolean = false;

    // ---- Profiling / stats (last completed frame) ----
    protected _profilingEnabled = true;
    protected _frameCounter = 0;
    protected _lastDt = 0;
    protected _lastFrameMs = 0;
    protected readonly _phaseMs = new Map<string, number>();
    protected readonly _systemMs = new Map<string, number>();

    // ---- Profiling history (rolling window) ----
    protected _historyCapacity = 120;
    protected readonly _histDt: number[] = [];
    protected readonly _histFrameMs: number[] = [];
    protected readonly _histPhaseMs = new Map<string, number[]>();
    protected readonly _histSystemMs = new Map<string, number[]>();

    // Drag state
    private isDragging: boolean = false;
    private dragOffsetX: number = 0;
    private dragOffsetY: number = 0;

    constructor(options: StatsOverlayOptions = {})
    {
        this.opts = {
            parent: options.parent ?? null,
            left: options.left ?? 8,
            top: options.top ?? 8,
            width: options.width ?? 320,
            height: options.height ?? 80,
            targetFrameMs: options.targetFrameMs ?? 16.67,
            slowFrameMs: options.slowFrameMs ?? 20,
            maxSamples: options.maxSamples ?? 240
        };
    }

    private initializeDom(): void
    {
        if (this.isInitialized || !this.opts.parent) return;
        this.isInitialized = true;

        this.root = document.createElement("div");
        this.root.style.position = "fixed";
        this.root.style.left = `${this.opts.left}px`;
        this.root.style.top = `${this.opts.top}px`;
        this.root.style.zIndex = "9999";
        this.root.style.fontFamily = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
        this.root.style.fontSize = "12px";
        this.root.style.color = "#d7e3ff";
        this.root.style.background = "rgba(10, 14, 24, 0.75)";
        this.root.style.border = "1px solid rgba(140, 170, 255, 0.25)";
        this.root.style.borderRadius = "8px";
        this.root.style.backdropFilter = "blur(2px)";
        this.root.style.maxWidth = "calc(100vw - 16px)";

        this.header = document.createElement("div");
        this.header.style.display = "flex";
        this.header.style.alignItems = "center";
        this.header.style.padding = "8px";
        this.header.style.cursor = "pointer";
        this.header.style.pointerEvents = "auto";
        this.header.style.userSelect = "none";

        const title = document.createElement("span");
        title.textContent = "ECS Stats";
        title.style.fontWeight = "600";
        title.style.userSelect = "none";
        title.style.marginRight = "10px";

        this.toggleButton = document.createElement("button");
        this.toggleButton.textContent = "−";
        this.toggleButton.style.background = "rgba(140, 170, 255, 0.15)";
        this.toggleButton.style.border = "1px solid rgba(140, 170, 255, 0.3)";
        this.toggleButton.style.borderRadius = "4px";
        this.toggleButton.style.color = "#d7e3ff";
        this.toggleButton.style.width = "24px";
        this.toggleButton.style.height = "24px";
        this.toggleButton.style.cursor = "pointer";
        this.toggleButton.style.fontSize = "16px";
        this.toggleButton.style.lineHeight = "1";
        this.toggleButton.style.padding = "0";
        this.toggleButton.style.display = "flex";
        this.toggleButton.style.alignItems = "center";
        this.toggleButton.style.justifyContent = "center";
        this.toggleButton.style.userSelect = "none";

        this.toggleButton.addEventListener("mouseenter", () => {
            this.toggleButton!.style.background = "rgba(140, 170, 255, 0.25)";
        });
        this.toggleButton.addEventListener("mouseleave", () => {
            this.toggleButton!.style.background = "rgba(140, 170, 255, 0.15)";
        });
        this.toggleButton.addEventListener("click", (e) => {
            e.stopPropagation();
            this.toggle();
        });

        this.debugToggleButton = this.createDebugToggleButton("🔇", "Toggle console debug logging");
        this.debugToggleButton.style.marginRight = "5px";
        this.debugToggleButton.addEventListener("click", (e) => {
            e.stopPropagation();
            this.toggleDebugLogging();
        });

        this.header.appendChild(title);
        this.header.appendChild(this.debugToggleButton);
        this.header.appendChild(this.toggleButton);

        this.content = document.createElement("div");
        this.content.style.padding = "0 8px 8px 8px";
        this.content.style.pointerEvents = "none";

        this.text = document.createElement("pre");
        this.text.style.margin = "0 0 6px 0";
        this.text.style.whiteSpace = "pre";
        this.text.style.lineHeight = "1.2";

        this.canvas = document.createElement("canvas");
        this.canvas.style.display = "block";
        this.canvas.style.borderRadius = "6px";
        this.canvas.style.background = "rgba(255,255,255,0.04)";
        this.canvas.style.width = "100%";
        this.canvas.style.height = "auto";

        const ctx = this.canvas.getContext("2d");
        if (!ctx) throw new Error("StatsOverlay: canvas 2D context not available");
        this.ctx = ctx;

        this.content.appendChild(this.text);
        this.content.appendChild(this.canvas);
        this.root.appendChild(this.header);
        this.root.appendChild(this.content);
        this.opts.parent.appendChild(this.root);

        this.resizeCanvas();
        this.resizeObserver = new ResizeObserver(() => this.resizeCanvas());
        this.resizeObserver.observe(this.root);

        this.setupDrag();
    }

    public setDebugging(enabled: boolean): void
    {
        if (enabled) {
            // Only initialize DOM if we're in a browser environment
            if (typeof document !== "undefined") {
                this.opts.parent = this.opts.parent ?? document.body;
                this.initializeDom();
            }
        } else {
            this.destroyOverlay();
        }
        this.debugingEnabled = enabled;
    }

    public setProfilingEnabled(enabled: boolean): void
    {
        this._profilingEnabled = enabled;
    }

    public setProfilingHistorySize(frames: number): void
    {
        this._historyCapacity = Math.max(0, Math.floor(frames));
        this._trimHistoryToCapacity();
    }

    protected _trimHistoryToCapacity(): void
    {
        const cap = this._historyCapacity;

        const trimArray = (arr: number[]) => {
            if (cap === 0) {
                arr.length = 0;
                return;
            }
            while (arr.length > cap) arr.shift();
        };

        trimArray(this._histDt);
        trimArray(this._histFrameMs);
        for (const arr of this._histPhaseMs.values()) trimArray(arr);
        for (const arr of this._histSystemMs.values()) trimArray(arr);
    }

    protected _pushSeriesFrame(series: Map<string, number[]>, current: Map<string, number>): void
    {
        const sizeBefore = this._histFrameMs.length; // same as dt length before push

        // Ensure existing keys get a value (0 if missing this frame)
        for (const [k, arr] of series) {
            const v = current.get(k) ?? 0;
            arr.push(v);
            if (this._historyCapacity === 0) arr.length = 0;
            else while (arr.length > this._historyCapacity) arr.shift();
        }

        // New keys discovered this frame: backfill zeros so lengths align
        for (const [k, v] of current) {
            if (series.has(k)) continue;
            const arr = new Array<number>(sizeBefore).fill(0);
            arr.push(v);
            series.set(k, arr);
            if (this._historyCapacity === 0) arr.length = 0;
            else while (arr.length > this._historyCapacity) arr.shift();
        }
    }

    /** @internal Called by Schedule/World.update to start a new profiling frame */
    public _profBeginFrame(dt: number): number
    {
        this._frameCounter++;
        this._lastDt = dt;

        this._phaseMs.clear();
        this._systemMs.clear();

        if (!this._profilingEnabled) {
            this._lastFrameMs = 0;
            return 0;
        }

        return performance.now();
    }

    /** @internal Called by Schedule/World.update to end a new profiling frame */
    public _profEndFrame(frameStartMs: number): void
    {
        if (!this._profilingEnabled) return;

        this._lastFrameMs = performance.now() - frameStartMs;

        // Update history (aligned series)
        this._histDt.push(this._lastDt);
        this._histFrameMs.push(this._lastFrameMs);
        this._trimHistoryToCapacity();

        this._pushSeriesFrame(this._histPhaseMs, this._phaseMs);
        this._pushSeriesFrame(this._histSystemMs, this._systemMs);
    }

    /** @internal */
    public _profAddPhase(phase: string, ms: number): void
    {
        if (!this._profilingEnabled) return;
        this._phaseMs.set(phase, (this._phaseMs.get(phase) ?? 0) + ms);
    }

    /** @internal */
    public _profAddSystem(name: string, ms: number): void
    {
        if (!this._profilingEnabled) return;
        this._systemMs.set(name, (this._systemMs.get(name) ?? 0) + ms);
    }

    private createDebugToggleButton(text: string, title: string): HTMLButtonElement
    {
        const btn = document.createElement("button");
        btn.textContent = text;
        btn.title = title;
        btn.style.background = "rgba(140, 170, 255, 0.15)";
        btn.style.border = "1px solid rgba(140, 170, 255, 0.3)";
        btn.style.borderRadius = "4px";
        btn.style.color = "#d7e3ff";
        btn.style.width = "24px";
        btn.style.height = "24px";
        btn.style.cursor = "pointer";
        btn.style.fontSize = "12px";
        btn.style.lineHeight = "1";
        btn.style.padding = "0";
        btn.style.display = "flex";
        btn.style.alignItems = "center";
        btn.style.justifyContent = "center";
        btn.style.userSelect = "none";

        btn.addEventListener("mouseenter", () => {
            btn.style.background = "rgba(140, 170, 255, 0.25)";
        });
        btn.addEventListener("mouseleave", () => {
            btn.style.background = "rgba(140, 170, 255, 0.15)";
        });

        return btn;
    }

    private toggleDebugLogging(): void
    {
        this.debugLoggingEnabled = !this.debugLoggingEnabled;
        this.debugToggleButton!.textContent = this.debugLoggingEnabled ? "🔊" : "🔇";
        this.debugToggleButton!.title = this.debugLoggingEnabled
            ? "Console debug logging ON (click to disable)"
            : "Console debug logging OFF (click to enable)";
    }

    private setupDrag(): void
    {
        const onMouseDown = (e: MouseEvent) => {
            // Ignore if clicking the toggle button
            if (e.target === this.toggleButton || e.target === this.debugToggleButton) return;

            this.isDragging = true;

            const rect = this.root!.getBoundingClientRect();
            this.dragOffsetX = e.clientX - rect.left;
            this.dragOffsetY = e.clientY - rect.top;

            this.header!.style.cursor = "grabbing";
            document.body.style.userSelect = "none";
        };

        const onMouseMove = (e: MouseEvent) => {
            if (!this.isDragging) return;

            const newLeft = e.clientX - this.dragOffsetX;
            const newTop = e.clientY - this.dragOffsetY;

            // Clamp to viewport bounds
            const rect = this.root!.getBoundingClientRect();
            const maxLeft = window.innerWidth - rect.width;
            const maxTop = window.innerHeight - rect.height;

            this.root!.style.left = `${Math.max(0, Math.min(newLeft, maxLeft))}px`;
            this.root!.style.top = `${Math.max(0, Math.min(newTop, maxTop))}px`;
        };

        const onMouseUp = () => {
            if (!this.isDragging) return;

            this.isDragging = false;
            this.header!.style.cursor = "grab";
            document.body.style.userSelect = "";
        };

        this.header!.addEventListener("mousedown", onMouseDown);
        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup", onMouseUp);

        // Store references for cleanup
        (this as any)._dragCleanup = () => {
            this.header!.removeEventListener("mousedown", onMouseDown);
            document.removeEventListener("mousemove", onMouseMove);
            document.removeEventListener("mouseup", onMouseUp);
        };
    }

    private resizeCanvas(): void
    {
        if (!this.canvas || !this.ctx) return;

        const dpr = window.devicePixelRatio || 1;
        const rect = this.canvas.getBoundingClientRect();
        const width = Math.min(this.opts.width, rect.width || this.opts.width);
        const height = this.opts.height;

        this.canvas.width = width * dpr;
        this.canvas.height = height * dpr;
        this.canvas.style.width = `${width}px`;
        this.canvas.style.height = `${height}px`;

        this.ctx.scale(dpr, dpr);
    }

    private toggle(): void
    {
        if (!this.content || !this.toggleButton) return;

        this.isExpanded = !this.isExpanded;
        this.content.style.display = this.isExpanded ? "block" : "none";
        this.toggleButton.textContent = this.isExpanded ? "−" : "+";
    }

    public destroyOverlay(): void
    {
        (this as any)._dragCleanup?.();
        this.resizeObserver?.disconnect();
        this.root?.remove();
        this.isInitialized = false;
    }

    /** Convenience: call each frame */
    public updateOverlay(stats: WorldStats, statsHistory: WorldStatsHistory): void
    {
        if (!this.debugingEnabled || !this.isInitialized) return;
        this.render(stats, statsHistory);
    }

    private render(s: WorldStats, h: WorldStatsHistory): void
    {
        if (!this.debugingEnabled || !this.text || !this.ctx) return;

        const topPhases = Object.entries(s.phaseMs)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 6)
            .map(([k, v]) => `${k}=${v.toFixed(2)}ms`)
            .join(" ");

        this.text.textContent =
            `Frame ${s.frame}\n` +
            `Archetypes: ${s.archetypes}\n` +
            `Rows: ${s.rows}\n` +
            `Alive entities: ${s.aliveEntities}\n` +
            `Systems: ${s.systems}\n` +
            `Resources: ${s.resources}\n` +
            `Event channels: ${s.eventChannels}\n` +
            `Pending commands: ${String(s.pendingCommands)}\n` +
            `dt=${(s.dt * 1000).toFixed(2)}ms frame=${s.frameMs.toFixed(2)}ms\n` +
            `Phases: ${topPhases}`;

        if (this.debugLoggingEnabled) {
            // tslint:disable-next-line:no-console
            console.debug(`Phases: ${topPhases}`);
        }

        this.drawFrameGraph(h);
    }

    private drawFrameGraph(h: WorldStatsHistory): void
    {
        const ctx = this.ctx!;
        const dpr = window.devicePixelRatio || 1;
        const w = this.canvas!.width / dpr;
        const hh = this.canvas!.height / dpr;

        ctx.clearRect(0, 0, w, hh);

        const n = Math.min(h.size, this.opts.maxSamples);
        const series = h.frameMs.slice(h.size - n);

        const maxMs = Math.max(33.33, this.opts.targetFrameMs, ...series);
        const toY = (ms: number) => hh - (ms / maxMs) * (hh - 10) - 5;

        // colors (match bars)
        const targetLineColor = "rgba(255,255,255,0.18)";
        const okBarColor = "rgba(110,200,255,0.85)";
        const slowBarColor = "rgba(255,110,110,0.85)";
        const legendTextColor = "rgba(215,227,255,0.90)";
        const legendBg = "rgba(10, 14, 24, 0.55)";

        // target line
        ctx.strokeStyle = targetLineColor;
        ctx.beginPath();
        ctx.moveTo(0, toY(this.opts.targetFrameMs));
        ctx.lineTo(w, toY(this.opts.targetFrameMs));
        ctx.stroke();

        // bars (use actual series length; ensure width >= 1px)
        const barW = Math.max(1, Math.floor(w / Math.max(1, series.length)));
        const drawW = Math.max(1, barW);

        for (let i = 0; i < series.length; i++) {
            const ms = series[i]!;
            const _x = i * barW;
            const _y = toY(ms);
            const bh = hh - _y;

            const slow = ms > this.opts.slowFrameMs;
            ctx.fillStyle = slow ? slowBarColor : okBarColor;
            ctx.fillRect(_x, _y, drawW, bh);
        }

        // ---- Legend (top-left inside graph) ----
        ctx.save();
        ctx.font = "11px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
        ctx.textBaseline = "middle";
        ctx.fillStyle = legendTextColor;

        const pad = 6;
        const lineH = 14;

        const lineLabel = `Target ${this.opts.targetFrameMs.toFixed(2)}ms`;
        const okLabel = `OK ≤ ${this.opts.slowFrameMs.toFixed(0)}ms`;
        const slowLabel = `Slow > ${this.opts.slowFrameMs.toFixed(0)}ms`;

        // compute background box width roughly
        const w1 = ctx.measureText(lineLabel).width;
        const w2 = ctx.measureText(okLabel).width;
        const w3 = ctx.measureText(slowLabel).width;
        const boxW = Math.ceil(Math.max(w1, w2, w3) + 40);
        const boxH = pad * 2 + lineH * 3;

        // background
        ctx.fillStyle = legendBg;
        ctx.fillRect(6, 6, boxW, boxH);

        // row 1: target line sample
        const x = 6 + pad;
        let y = 6 + pad + lineH * 0.5;
        ctx.strokeStyle = targetLineColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 18, y);
        ctx.stroke();

        ctx.fillStyle = legendTextColor;
        ctx.fillText(lineLabel, x + 24, y);

        // row 2: ok bar sample
        y += lineH;
        ctx.fillStyle = okBarColor;
        ctx.fillRect(x, y - 5, 18, 10);
        ctx.fillStyle = legendTextColor;
        ctx.fillText(okLabel, x + 24, y);

        // row 3: slow bar sample
        y += lineH;
        ctx.fillStyle = slowBarColor;
        ctx.fillRect(x, y - 5, 18, 10);
        ctx.fillStyle = legendTextColor;
        ctx.fillText(slowLabel, x + 24, y);

        ctx.restore();
    }
}
