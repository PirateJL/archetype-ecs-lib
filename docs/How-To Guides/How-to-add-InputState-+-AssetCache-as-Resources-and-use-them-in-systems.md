# How to add InputState + AssetCache as Resources and use them in systems

## Goal

Store **Input state** and an **Asset cache** as world **Resources**, then access them inside systems using `requireResource()`.

### Example InputStateRes

```ts
export class InputStateRes
{
    public keysDown = new Set<string>();
    public keysPressed = new Set<string>();   // pressed this frame
    public keysReleased = new Set<string>();  // released this frame

    public mouseX = 0;
    public mouseY = 0;
    public mouseButtonsDown = new Set<number>();
    public mousePressed = new Set<number>();   // pressed this frame
    public mouseReleased = new Set<number>();  // released this frame
    public wheelDeltaY = 0;

    beginFrame(): void
    {
        this.keysPressed.clear();
        this.keysReleased.clear();
        this.mousePressed.clear();
        this.mouseReleased.clear();
        this.wheelDeltaY = 0;
    }

    keyDown(code: string): void
    {
        if (!this.keysDown.has(code)) this.keysPressed.add(code);
        this.keysDown.add(code);
    }

    keyUp(code: string): void
    {
        if (this.keysDown.has(code)) this.keysReleased.add(code);
        this.keysDown.delete(code);
    }

    mouseMove(x: number, y: number): void {
        this.mouseX = x;
        this.mouseY = y;
    }

    mouseDown(btn: number): void
    {
        if (!this.mouseButtonsDown.has(btn)) this.mousePressed.add(btn);
        this.mouseButtonsDown.add(btn);
    }

    mouseUp(btn: number): void
    {
        if (this.mouseButtonsDown.has(btn)) this.mouseReleased.add(btn);
        this.mouseButtonsDown.delete(btn);
    }

    wheel(deltaY: number): void
    {
        this.wheelDeltaY += deltaY;
    }
}
```


### Example AssetCacheRes

```ts
export class AssetCacheRes
{
    private images = new Map<string, HTMLImageElement>();
    private pending = new Map<string, Promise<HTMLImageElement>>();

    /** Loads once, dedupes concurrent calls, returns the same instance thereafter. */
    public getImage(url: string): Promise<HTMLImageElement>
    {
        const ready = this.images.get(url);
        if (ready) return Promise.resolve(ready);

        const p = this.pending.get(url);
        if (p) return p;

        const promise = new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                this.images.set(url, img);
                this.pending.delete(url);
                resolve(img);
            };
            img.onerror = (e) => {
                this.pending.delete(url);
                reject(e);
            };
            img.src = url;
        });

        this.pending.set(url, promise);
        return promise;
    }

    /** Returns the image if already loaded; otherwise undefined. */
    public peekImage(url: string): HTMLImageElement | undefined {
        return this.images.get(url);
    }
}
```

---

## 1) Register the resources at startup

```ts
world.initResource(InputStateRes, () => new InputStateRes());
world.initResource(AssetCacheRes, () => new AssetCacheRes());
```

That’s the only “required” setup. Everything else assumes these exist.

---

## 2) Wire DOM events into `InputStateRes`

Attach listeners once:

```ts
export function attachInput(world: WorldApi): void
{
    const input = world.requireResource(InputStateRes);

    window.addEventListener("keydown", e => input.keyDown(e.code));
    window.addEventListener("keyup",   e => input.keyUp(e.code));
    window.addEventListener("mousemove", e => input.mouseMove(e.clientX, e.clientY));
    window.addEventListener("mousedown", e => input.mouseDown(e.button));
    window.addEventListener("mouseup",   e => input.mouseUp(e.button));
    window.addEventListener("wheel",     e => input.wheel(e.deltaY), { passive: true });
}
```

Call it after `initResource(...)`.

---

## 3) Reset “pressed/released” flags once per frame

Add a phase/system that runs before gameplay update:

```ts
export function beginFrameSystem(w: WorldApi, _dt: number): void
{
    w.requireResource(InputStateRes).beginFrame();
}
```

---

## 4) Read input from systems

Example “move player” system:

```ts
export function playerMoveSystem(w: WorldApi, dt: number): void
{
    const input = w.requireResource(InputStateRes);

    let dx = 0, dy = 0;
    if (input.keysDown.has("KeyW")) dy -= 1;
    if (input.keysDown.has("KeyS")) dy += 1;
    if (input.keysDown.has("KeyA")) dx -= 1;
    if (input.keysDown.has("KeyD")) dx += 1;

    const speed = 220;

    for (const { c1: tr } of w.query(Transform, PlayerTag)) {
        tr.x += dx * speed * dt;
        tr.y += dy * speed * dt;
    }
}
```

---

## 5) Use `AssetCacheRes` in a render system (deduped async loads)

```ts
export function renderSpritesSystem(ctx: CanvasRenderingContext2D)
{
    return (w: WorldApi, _dt: number): void => {
        const assets = w.requireResource(AssetCacheRes);

        for (const { c1: tr, c2: sp } of w.query(Transform, Sprite)) {
            assets.getImage(sp.url).catch(() => {});
            const img = assets.peekImage(sp.url);
            if (!img) continue;

            ctx.drawImage(img, tr.x, tr.y, sp.w, sp.h);
        }
    };
}
```

---

## 6) Run phases in order

Minimal schedule:

```ts
sched.add("beginFrame", beginFrameSystem);
sched.add("update", playerMoveSystem);
sched.add("render", renderSpritesSystem(ctx));
```

Game loop:

```ts
sched.run(world, dt, ["beginFrame", "update", "render"]);
```

(Use your existing `Schedule` call shape; the key requirement is **beginFrame before update**.)

---

## Common variations

### Optional resource usage

If a resource is optional (debug/editor), use:

```ts
const dbg = w.getResource(DebugRes);
if (dbg) dbg.enabled = true;
```

### Preload assets (menu/loading screen)

```ts
await Promise.all(urls.map(u => world.requireResource(AssetCacheRes).getImage(u)));
```
