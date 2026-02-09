import {
    Schedule,
    World,
    type ComponentCtor,
    type SnapshotCodec,
    type WorldApi,
    type WorldSnapshot
} from "../src";

// ------------------------------
// Components
// ------------------------------
class Position {
    constructor(public x = 0, public y = 0) { }
}

class Velocity {
    constructor(public x = 0, public y = 0) { }
}

class Circle {
    constructor(public radius = 10) { }
}

class PlayerTag { }

type ItemKind = "star" | "bomb";
type FallingKind = { kind: ItemKind };
const FallingKindToken = (() => ({ kind: "star" as ItemKind })) as ComponentCtor<FallingKind>;

// ------------------------------
// Resources
// ------------------------------
class GameState {
    constructor(
        public score = 0,
        public lives = 3,
        public spawnTimer = 0.5,
        public running = true
    ) { }
}

type SpawnConfig = {
    intervalMin: number;
    intervalMax: number;
    starChance: number;
    starSpeed: number;
    bombSpeed: number;
};

const SpawnConfigToken = (() => ({
    intervalMin: 0.3,
    intervalMax: 0.72,
    starChance: 0.72,
    starSpeed: 150,
    bombSpeed: 220
})) as ComponentCtor<SpawnConfig>;

// ------------------------------
// Events
// ------------------------------
class SpawnItemEvent {
    constructor(public kind: ItemKind, public x: number) { }
}

class ItemCollectedEvent {
    constructor(public kind: ItemKind) { }
}

// ------------------------------
// Runtime-only state
// ------------------------------
type ControlAction = "save" | "load" | "reset";

type InputState = {
    leftHeld: boolean;
    rightHeld: boolean;
    actions: ControlAction[];
};

type Viewport = {
    width: number;
    height: number;
};

type ToastState = {
    message: string;
    ttl: number;
};

const PLAYER_SPEED = 320;
const PLAYER_Y_OFFSET = 42;
const PLAYER_RADIUS = 16;
const STAR_RADIUS = 10;
const BOMB_RADIUS = 12;

function randomBetween(min: number, max: number): number {
    return min + Math.random() * (max - min);
}

function setupInput(input: InputState): void {
    window.addEventListener("keydown", (ev) => {
        switch (ev.code) {
            case "ArrowLeft":
            case "KeyA":
                input.leftHeld = true;
                ev.preventDefault();
                return;
            case "ArrowRight":
            case "KeyD":
                input.rightHeld = true;
                ev.preventDefault();
                return;
            case "KeyS":
                if (!ev.repeat) input.actions.push("save");
                ev.preventDefault();
                return;
            case "KeyL":
                if (!ev.repeat) input.actions.push("load");
                ev.preventDefault();
                return;
            case "KeyR":
                if (!ev.repeat) input.actions.push("reset");
                ev.preventDefault();
                return;
            default:
                return;
        }
    });

    window.addEventListener("keyup", (ev) => {
        switch (ev.code) {
            case "ArrowLeft":
            case "KeyA":
                input.leftHeld = false;
                ev.preventDefault();
                return;
            case "ArrowRight":
            case "KeyD":
                input.rightHeld = false;
                ev.preventDefault();
                return;
            default:
                return;
        }
    });
}

function bootstrapWorld(world: World, viewport: Viewport): void {
    world.setResource(GameState, new GameState());
    world.setResource(SpawnConfigToken, {
        intervalMin: 0.3,
        intervalMax: 0.72,
        starChance: 0.72,
        starSpeed: 150,
        bombSpeed: 220
    });

    const player = world.spawn();
    world.addMany(
        player,
        [PlayerTag, new PlayerTag()],
        [Position, new Position(viewport.width * 0.5, viewport.height - PLAYER_Y_OFFSET)],
        [Velocity, new Velocity(0, 0)],
        [Circle, new Circle(PLAYER_RADIUS)]
    );
}

function registerSnapshotCodecs(world: World): void {
    const positionCodec: SnapshotCodec<Position, { x: number; y: number }> = {
        key: "comp.position",
        serialize: (v) => ({ x: v.x, y: v.y }),
        deserialize: (data) => new Position(data.x, data.y)
    };

    const velocityCodec: SnapshotCodec<Velocity, { x: number; y: number }> = {
        key: "comp.velocity",
        serialize: (v) => ({ x: v.x, y: v.y }),
        deserialize: (data) => new Velocity(data.x, data.y)
    };

    const circleCodec: SnapshotCodec<Circle, { radius: number }> = {
        key: "comp.circle",
        serialize: (v) => ({ radius: v.radius }),
        deserialize: (data) => new Circle(data.radius)
    };

    const playerTagCodec: SnapshotCodec<PlayerTag, true> = {
        key: "tag.player",
        serialize: () => true,
        deserialize: () => new PlayerTag()
    };

    const fallingCodec: SnapshotCodec<FallingKind, { kind: ItemKind }> = {
        key: "comp.falling-kind",
        serialize: (v) => ({ kind: v.kind }),
        deserialize: (data) => ({ kind: data.kind })
    };

    const gameStateCodec: SnapshotCodec<GameState, {
        score: number;
        lives: number;
        spawnTimer: number;
        running: boolean;
    }> = {
        key: "res.game-state",
        serialize: (v) => ({
            score: v.score,
            lives: v.lives,
            spawnTimer: v.spawnTimer,
            running: v.running
        }),
        deserialize: (data) => new GameState(data.score, data.lives, data.spawnTimer, data.running)
    };

    const spawnConfigCodec: SnapshotCodec<SpawnConfig, SpawnConfig> = {
        key: "res.spawn-config",
        serialize: (v) => ({ ...v }),
        deserialize: (data) => ({ ...data })
    };

    world.registerComponentSnapshot(Position, positionCodec);
    world.registerComponentSnapshot(Velocity, velocityCodec);
    world.registerComponentSnapshot(Circle, circleCodec);
    world.registerComponentSnapshot(PlayerTag, playerTagCodec);
    world.registerComponentSnapshot(FallingKindToken, fallingCodec);

    world.registerResourceSnapshot(GameState, gameStateCodec);
    world.registerResourceSnapshot(SpawnConfigToken, spawnConfigCodec);
}

function queueSpawnItem(world: WorldApi, kind: ItemKind, x: number, speed: number): void {
    const radius = kind === "star" ? STAR_RADIUS : BOMB_RADIUS;
    world.cmd().spawnBundle(
        [Position, new Position(x, -radius - 4)],
        [Velocity, new Velocity(0, speed)],
        [Circle, new Circle(radius)],
        [FallingKindToken, { kind }]
    );
}

function createBeginFrameSystem(toast: ToastState) {
    return (_world: WorldApi, dt: number): void => {
        if (toast.ttl <= 0) return;
        toast.ttl = Math.max(0, toast.ttl - dt);
    };
}

function createInputSystem(input: InputState, actionQueue: ControlAction[]) {
    return (world: WorldApi, _dt: number): void => {
        const game = world.requireResource(GameState);
        const horizontal = (input.leftHeld ? -1 : 0) + (input.rightHeld ? 1 : 0);

        world.queryEach(Velocity, PlayerTag, (_entity: { id: number; gen: number }, velocity: Velocity, _player: PlayerTag) => {
            velocity.x = game.running ? horizontal * PLAYER_SPEED : 0;
            velocity.y = 0;
        });

        if (input.actions.length === 0) return;
        for (const action of input.actions) actionQueue.push(action);
        input.actions.length = 0;
    };
}

function createSimulateSystem(viewport: Viewport) {
    return (world: WorldApi, dt: number): void => {
        const game = world.requireResource(GameState);

        if (game.running) {
            const cfg = world.requireResource(SpawnConfigToken);
            game.spawnTimer -= dt;

            while (game.spawnTimer <= 0) {
                game.spawnTimer += randomBetween(cfg.intervalMin, cfg.intervalMax);
                const kind: ItemKind = Math.random() < cfg.starChance ? "star" : "bomb";
                const x = randomBetween(24, Math.max(24, viewport.width - 24));
                world.emit(SpawnItemEvent, new SpawnItemEvent(kind, x));
            }
        }

        world.queryEach(Position, Velocity, (_entity: { id: number; gen: number }, position: Position, velocity: Velocity) => {
            position.x += velocity.x * dt;
            position.y += velocity.y * dt;
        });

        world.queryEach(Position, Circle, PlayerTag, (_entity: { id: number; gen: number }, position: Position, circle: Circle, _player: PlayerTag) => {
            const minX = circle.radius;
            const maxX = Math.max(minX, viewport.width - circle.radius);

            if (position.x < minX) position.x = minX;
            if (position.x > maxX) position.x = maxX;

            position.y = viewport.height - PLAYER_Y_OFFSET;
        });

        for (const { e, c1: position, c2: circle } of world.query(Position, Circle, FallingKindToken)) {
            if (position.y - circle.radius > viewport.height + 8) {
                world.cmd().despawn(e);
            }
        }
    };
}

function applySpawnsSystem(world: WorldApi, _dt: number): void {
    const cfg = world.requireResource(SpawnConfigToken);

    world.drainEvents(SpawnItemEvent, (ev) => {
        const speed = ev.kind === "star" ? cfg.starSpeed : cfg.bombSpeed;
        queueSpawnItem(world, ev.kind, ev.x, speed);
    });
}

function collideSystem(world: WorldApi, _dt: number): void {
    let hasPlayer = false;
    let playerX = 0;
    let playerY = 0;
    let playerR = 0;

    for (const { c1: pos, c2: circle } of world.query(Position, Circle, PlayerTag)) {
        playerX = pos.x;
        playerY = pos.y;
        playerR = circle.radius;
        hasPlayer = true;
        break;
    }

    if (!hasPlayer) return;

    const game = world.requireResource(GameState);
    if (!game.running) return;

    for (const { e, c1: pos, c2: circle, c3: falling } of world.query(Position, Circle, FallingKindToken)) {
        const dx = pos.x - playerX;
        const dy = pos.y - playerY;
        const reach = playerR + circle.radius;

        if (dx * dx + dy * dy > reach * reach) continue;

        world.cmd().despawn(e);
        world.emit(ItemCollectedEvent, new ItemCollectedEvent(falling.kind));
    }
}

function resolveSystem(world: WorldApi, _dt: number): void {
    const game = world.requireResource(GameState);

    world.drainEvents(ItemCollectedEvent, (ev) => {
        if (ev.kind === "star") {
            game.score += 10;
            return;
        }

        game.lives = Math.max(0, game.lives - 1);
        if (game.lives === 0) game.running = false;
    });
}

function createRenderSystem(ctx: CanvasRenderingContext2D, viewport: Viewport, toast: ToastState) {
    return (world: WorldApi, _dt: number): void => {
        ctx.clearRect(0, 0, viewport.width, viewport.height);

        const bg = ctx.createLinearGradient(0, 0, 0, viewport.height);
        bg.addColorStop(0, "#0a1528");
        bg.addColorStop(1, "#09101a");
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, viewport.width, viewport.height);

        for (const table of world.queryTables(Position, Circle, FallingKindToken)) {
            for (let i = 0; i < table.entities.length; i++) {
                const pos = table.c1[i]!;
                const circle = table.c2[i]!;
                const falling = table.c3[i]!;

                ctx.beginPath();
                ctx.arc(pos.x, pos.y, circle.radius, 0, Math.PI * 2);
                ctx.fillStyle = falling.kind === "star" ? "#7ef9ff" : "#ff6b6b";
                ctx.fill();
            }
        }

        for (const { c1: pos, c2: circle } of world.query(Position, Circle, PlayerTag)) {
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, circle.radius, 0, Math.PI * 2);
            ctx.fillStyle = "#b5ff7e";
            ctx.fill();

            ctx.beginPath();
            ctx.arc(pos.x, pos.y, circle.radius + 3, 0, Math.PI * 2);
            ctx.strokeStyle = "rgba(181, 255, 126, 0.35)";
            ctx.lineWidth = 2;
            ctx.stroke();
        }

        const game = world.requireResource(GameState);
        const stats = world.stats();

        ctx.fillStyle = "#eaf2ff";
        ctx.font = "16px monospace";
        ctx.fillText(`Score: ${game.score}`, 14, 24);
        ctx.fillText(`Lives: ${game.lives}`, 14, 44);
        ctx.fillText(`Entities: ${stats.aliveEntities}`, 14, 64);

        ctx.fillStyle = "#9db5d0";
        ctx.fillText("Move: A/D or Arrows", 14, viewport.height - 48);
        ctx.fillText("Save: S | Load: L | Reset: R", 14, viewport.height - 28);

        if (!game.running) {
            ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
            ctx.fillRect(0, 0, viewport.width, viewport.height);

            ctx.fillStyle = "#ffffff";
            ctx.font = "bold 28px monospace";
            ctx.textAlign = "center";
            ctx.fillText("Game Over", viewport.width * 0.5, viewport.height * 0.5 - 8);

            ctx.font = "16px monospace";
            ctx.fillStyle = "#cfe0ff";
            ctx.fillText("Press R to restore the initial snapshot", viewport.width * 0.5, viewport.height * 0.5 + 22);
            ctx.textAlign = "start";
        }

        if (toast.ttl > 0) {
            ctx.fillStyle = "rgba(12, 20, 34, 0.86)";
            ctx.fillRect(12, 76, 420, 30);
            ctx.strokeStyle = "rgba(147, 199, 255, 0.45)";
            ctx.strokeRect(12, 76, 420, 30);

            ctx.fillStyle = "#9ce3ff";
            ctx.font = "14px monospace";
            ctx.fillText(toast.message, 22, 96);
        }
    };
}

function main(): void {
    const canvas = document.querySelector<HTMLCanvasElement>("#appCanvas");
    if (!canvas) {
        throw new Error("Missing #appCanvas element in example/index.html");
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
        throw new Error("2D canvas context unavailable");
    }

    document.title = "archetype-ecs-lib | Falling Stars";
    document.body.style.margin = "0";
    document.body.style.background = "#060b14";
    document.body.style.display = "grid";
    document.body.style.placeItems = "center";

    canvas.style.border = "2px solid #1d2f48";
    canvas.style.borderRadius = "10px";
    canvas.style.boxShadow = "0 22px 60px rgba(0, 0, 0, 0.45)";

    const viewport: Viewport = { width: 960, height: 540 };
    const input: InputState = { leftHeld: false, rightHeld: false, actions: [] };
    const toast: ToastState = { message: "", ttl: 0 };
    const actionQueue: ControlAction[] = [];

    setupInput(input);

    const world = new World();
    const schedule = new Schedule();

    world.setDebugging(true);
    world.setProfilingEnabled(true);
    world.setProfilingHistorySize(240);

    registerSnapshotCodecs(world);
    bootstrapWorld(world, viewport);

    let quickSave: WorldSnapshot | null = null;
    const initialSnapshot = world.snapshot();

    const beginFrameSystem = createBeginFrameSystem(toast);
    const inputSystem = createInputSystem(input, actionQueue);
    const simulateSystem = createSimulateSystem(viewport);
    const renderSystem = createRenderSystem(ctx, viewport, toast);

    schedule.add(world, "begin", beginFrameSystem);
    schedule.add(world, "input", inputSystem).after("begin");
    schedule.add(world, "simulate", simulateSystem).after("input");
    schedule.add(world, "spawn", applySpawnsSystem).after("simulate");
    schedule.add(world, "collide", collideSystem).after("spawn");
    schedule.add(world, "resolve", resolveSystem).after("collide");
    schedule.add(world, "render", renderSystem).after("resolve");

    const resize = () => {
        const maxW = Math.min(window.innerWidth - 24, 960);
        const maxH = Math.min(window.innerHeight - 24, 540);

        viewport.width = Math.max(480, Math.floor(maxW));
        viewport.height = Math.max(300, Math.floor(maxH));

        const dpr = Math.max(1, window.devicePixelRatio || 1);
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    window.addEventListener("resize", resize);
    resize();

    const setToast = (message: string) => {
        toast.message = message;
        toast.ttl = 2.2;
    };

    let last = performance.now();

    const frame = (now: number) => {
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;

        schedule.run(world, dt);

        if (actionQueue.length > 0) {
            for (const action of actionQueue) {
                if (action === "save") {
                    quickSave = world.snapshot();
                    setToast("Snapshot saved (S)");
                    continue;
                }

                if (action === "load") {
                    if (!quickSave) {
                        setToast("No quick-save yet. Press S first.");
                        continue;
                    }
                    console.log(quickSave);
                    world.restore(quickSave);
                    setToast("Snapshot restored (L)");
                    continue;
                }

                world.restore(initialSnapshot);
                setToast("Run reset to initial snapshot (R)");
            }
            actionQueue.length = 0;
        }

        requestAnimationFrame(frame);
    };

    requestAnimationFrame(frame);
}

main();
