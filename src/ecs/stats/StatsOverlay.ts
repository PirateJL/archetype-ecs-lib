import type { WorldApi, WorldStats, WorldStatsHistory } from "../Types";

export type StatsOverlayOptions = Readonly<{
    /** Parent element to attach the overlay to. Defaults to document.body */
    parent?: HTMLElement;

    /** Fixed positioning offsets */
    left?: number;
    top?: number;

    /** Canvas size */
    width?: number;
    height?: number;

    /** Target frame time line (ms). Defaults to 16.67 (60fps). */
    targetFrameMs?: number;

    /** Threshold where bars become "slow" (ms). Defaults to 20. */
    slowFrameMs?: number;

    /** How many history samples to render (uses world history capacity). */
    maxSamples?: number;
}>;

export class StatsOverlay
{
    private readonly root: HTMLDivElement;
    private readonly text: HTMLPreElement;
    private readonly canvas: HTMLCanvasElement;
    private readonly ctx: CanvasRenderingContext2D;

    private opts: Required<Omit<StatsOverlayOptions, "parent">> & { parent: HTMLElement };

    constructor(options: StatsOverlayOptions = {})
    {
        const parent = options.parent ?? document.body;

        this.opts = {
            parent,
            left: options.left ?? 8,
            top: options.top ?? 8,
            width: options.width ?? 320,
            height: options.height ?? 80,
            targetFrameMs: options.targetFrameMs ?? 16.67,
            slowFrameMs: options.slowFrameMs ?? 20,
            maxSamples: options.maxSamples ?? 240
        };

        this.root = document.createElement("div");
        this.root.style.position = "fixed";
        this.root.style.left = `${this.opts.left}px`;
        this.root.style.top = `${this.opts.top}px`;
        this.root.style.zIndex = "9999";
        this.root.style.pointerEvents = "none";
        this.root.style.fontFamily = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
        this.root.style.fontSize = "12px";
        this.root.style.color = "#d7e3ff";
        this.root.style.background = "rgba(10, 14, 24, 0.75)";
        this.root.style.border = "1px solid rgba(140, 170, 255, 0.25)";
        this.root.style.borderRadius = "8px";
        this.root.style.padding = "8px";
        this.root.style.backdropFilter = "blur(2px)";

        this.text = document.createElement("pre");
        this.text.style.margin = "0 0 6px 0";
        this.text.style.whiteSpace = "pre";
        this.text.style.lineHeight = "1.2";

        this.canvas = document.createElement("canvas");
        this.canvas.width = this.opts.width;
        this.canvas.height = this.opts.height;
        this.canvas.style.display = "block";
        this.canvas.style.borderRadius = "6px";
        this.canvas.style.background = "rgba(255,255,255,0.04)";

        const ctx = this.canvas.getContext("2d");
        if (!ctx) throw new Error("StatsOverlay: canvas 2D context not available");
        this.ctx = ctx;

        this.root.appendChild(this.text);
        this.root.appendChild(this.canvas);
        this.opts.parent.appendChild(this.root);
    }

    destroy(): void
    {
        this.root.remove();
    }

    /** Convenience: call each frame */
    public update(world: WorldApi): void
    {
        this.render(world.stats(), world.statsHistory());
    }

    private render(s: WorldStats, h: WorldStatsHistory): void
    {
        const topPhases = Object.entries(s.phaseMs)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 6)
            .map(([k, v]) => `${k}=${v.toFixed(2)}ms`)
            .join(" ");

        this.text.textContent =
            `ECS Stats (frame ${s.frame})\n` +
            `alive=${s.aliveEntities} arch=${s.archetypes} rows=${s.rows}\n` +
            `dt=${(s.dt * 1000).toFixed(2)}ms frame=${s.frameMs.toFixed(2)}ms pendingCmd=${String(s.pendingCommands)}\n` +
            `phases: ${topPhases}`;

        // tslint:disable-next-line:no-console
        console.debug(`phases: ${topPhases}`);

        this.drawFrameGraph(h);
    }

    private drawFrameGraph(h: WorldStatsHistory): void
    {
        const ctx = this.ctx;
        const w = this.canvas.width;
        const hh = this.canvas.height;

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
