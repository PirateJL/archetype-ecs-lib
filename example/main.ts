import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { World, Schedule, type WorldApi } from "../src/index";

// ------------------------------
// Components
// ------------------------------
class Transform {
    public pos = new THREE.Vector3();
    public rot = new THREE.Euler();
    public scale = new THREE.Vector3(1, 1, 1);
}

class MeshRef {
    constructor(public mesh: THREE.Mesh) { }
}

class Spin {
    constructor(public yRadPerSec: number) { }
}

class Lifetime {
    constructor(public seconds: number) { }
}

class Clickable { } // marker

// ------------------------------
// Resources
// ------------------------------
class InputResource {
    public pendingClicks: { x: number; y: number; button: number }[] = [];
    beginFrame() {
        // keep pendingClicks (produced by DOM) until input phase consumes them
    }
    pushClick(x: number, y: number, button: number) {
        this.pendingClicks.push({ x, y, button });
    }
    drainClicks() {
        const out = this.pendingClicks;
        this.pendingClicks = [];
        return out;
    }
}

class TextureCacheResource {
    private loader = new THREE.TextureLoader();
    private textures = new Map<string, THREE.Texture>();
    private pending = new Map<string, Promise<THREE.Texture>>();

    get(url: string): Promise<THREE.Texture> {
        const ready = this.textures.get(url);
        if (ready) return Promise.resolve(ready);

        const p = this.pending.get(url);
        if (p) return p;

        const promise = new Promise<THREE.Texture>((resolve, reject) => {
            this.loader.load(
                url,
                (tex) => {
                    this.textures.set(url, tex);
                    this.pending.delete(url);
                    resolve(tex);
                },
                undefined,
                (err) => {
                    this.pending.delete(url);
                    reject(err);
                }
            );
        });

        this.pending.set(url, promise);
        return promise;
    }
}

class ThreeResource {
    public scene: THREE.Scene;
    public camera: THREE.PerspectiveCamera;
    public renderer: THREE.WebGLRenderer;
    public controls: OrbitControls

    public raycaster = new THREE.Raycaster();
    public ndc = new THREE.Vector2();

    // Map Three meshes -> ECS entities (for picking)
    public entityByObject = new WeakMap<THREE.Object3D, { id: number; gen: number }>();

    constructor(canvas: HTMLCanvasElement) {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0b1020);

        this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
        this.camera.position.set(0, 3, 8);

        this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        document.body.style.margin = "0";
        this.renderer.domElement.style.margin = "0";
        document.body.appendChild(this.renderer.domElement);

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.target.set(0, 0, 0);

        const light = new THREE.DirectionalLight(0xffffff, 1.2);
        light.position.set(3, 5, 2);
        this.scene.add(light);

        const amb = new THREE.AmbientLight(0xffffff, 0.3);
        this.scene.add(amb);

        const grid = new THREE.GridHelper(20, 20);
        this.scene.add(grid);
    }

    resize(w: number, h: number) {
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(w, h, false);
    }
}

// ------------------------------
// Events
// ------------------------------
class ClickEvent {
    constructor(public x: number, public y: number, public button: number) { }
}

class SpawnCubeEvent {
    constructor(public at: THREE.Vector3) { }
}

class ToggleColorEvent {
    constructor(public target: { id: number; gen: number }) { }
}

class PlaySoundEvent {
    constructor(public id: string) { }
}

// ------------------------------
// Helpers
// ------------------------------
function rand(min: number, max: number) {
    return min + Math.random() * (max - min);
}

function createCubeMesh(colorHex: number, texture?: THREE.Texture): THREE.Mesh {
    const materialParams = texture === undefined ? 
        {color: colorHex} : {color: colorHex, map: texture};
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshStandardMaterial(materialParams);
    return new THREE.Mesh(geo, mat);
}

// Enqueue cube spawn via Commands (deferred structural changes)
function enqueueSpawnCube(world: any, pos: THREE.Vector3) {
    world.cmd().spawn((e: { id: number; gen: number }) => {
        const three = world.requireResource(ThreeResource);

        const mesh = createCubeMesh(0x44ccff);
        mesh.position.copy(pos);
        three.scene.add(mesh);
        three.entityByObject.set(mesh, e);

        // add components via commands so they apply in the SAME flush (flush loops until empty)
        world.cmd().add(e, Transform, (() => {
            const t = new Transform();
            t.pos.copy(pos);
            return t;
        })());

        world.cmd().add(e, MeshRef, new MeshRef(mesh));
        world.cmd().add(e, Spin, new Spin(rand(-2, 2)));
        world.cmd().add(e, Lifetime, new Lifetime(rand(8, 16)));
        world.cmd().add(e, Clickable, new Clickable());
    });
}

// ------------------------------
// Systems (phases)
// ------------------------------

// beginFrame: reset per-frame state
function beginFrameSystem(w: WorldApi, _dt: number) {
    w.requireResource(InputResource).beginFrame();
}

// input: convert raw input resource -> ClickEvent(s)
function inputSystem(w: WorldApi, _dt: number) {
    const input = w.requireResource(InputResource);
    // console.log(input);
    for (const c of input.drainClicks()) {
        w.emit(ClickEvent, new ClickEvent(c.x, c.y, c.button));
    }
}

// beforeUpdate: pick objects + emit semantic events
function pickingSystem(w: WorldApi, _dt: number) {
    const three = w.requireResource(ThreeResource);

    w.drainEvents(ClickEvent, (ev: ClickEvent) => {
        // screen -> NDC
        const rect = three.renderer.domElement.getBoundingClientRect();
        three.ndc.x = ((ev.x - rect.left) / rect.width) * 2 - 1;
        three.ndc.y = -(((ev.y - rect.top) / rect.height) * 2 - 1);

        three.raycaster.setFromCamera(three.ndc, three.camera);

        // Intersect all meshes currently in scene
        const hits = three.raycaster.intersectObjects(three.scene.children, true);
        const meshHit = hits.find((h: any) => (h.object as any).isMesh);

        if (meshHit) {
            // Find owning entity (walk up parents until mapped)
            let obj: THREE.Object3D | null = meshHit.object;
            let ent: any | undefined;
            while (obj && !ent) {
                ent = three.entityByObject.get(obj);
                obj = obj.parent;
            }

            if (ent) {
                w.emit(ToggleColorEvent, new ToggleColorEvent(ent));
                w.emit(PlaySoundEvent, new PlaySoundEvent("click"));
            }

            // Key change: ANY mesh hit blocks spawning
            return;
        }

        // Clicked, no mesh hit -> spawn cube near origin
        w.emit(SpawnCubeEvent, new SpawnCubeEvent(new THREE.Vector3(rand(-4, 4), 0.5, rand(-4, 4))));
        w.emit(PlaySoundEvent, new PlaySoundEvent("spawn"));
    });
}

// update: consume semantic events, run gameplay, and sync transforms
function updateSystem(w: WorldApi, dt: number) {
    // push the audio to the next phase
    forwardSoundSystem(w, dt);

    // Spawn cubes via deferred commands (applied on flush after this phase)
    w.drainEvents(SpawnCubeEvent, (ev: SpawnCubeEvent) => {
        enqueueSpawnCube(w, ev.at);
    });

    // Toggle cube colors (non-structural, do it directly)
    w.drainEvents(ToggleColorEvent, (ev: ToggleColorEvent) => {
        const meshRef = w.get(ev.target, MeshRef) as MeshRef | undefined;
        if (!meshRef) return;
        const mat = meshRef.mesh.material as THREE.MeshStandardMaterial;
        mat.color.setHex(mat.color.getHex() ^ 0xffffff);
    });

    // Spin cubes + lifetime countdown (query demonstrates archetype iteration)
    for (const { e, c1: tr, c2: meshRef, c3: spin, c4: life } of w.query(Transform, MeshRef, Spin, Lifetime)) {
        tr.rot.y += spin.yRadPerSec * dt;
        life.seconds -= dt;

        // Sync transform -> mesh (common ECS render sync pattern)
        meshRef.mesh.position.copy(tr.pos);
        meshRef.mesh.rotation.copy(tr.rot);

        // Despawn expired cubes (deferred structural change)
        if (life.seconds <= 0) {
            const three = w.requireResource(ThreeResource);
            three.scene.remove(meshRef.mesh);
            w.cmd().despawn(e);
            w.emit(PlaySoundEvent, new PlaySoundEvent("pop"));
        }
    }
}

// afterUpdate: forward PlaySoundEvent to later phases (demonstrates phase-to-phase event delivery)
function forwardSoundSystem(w: WorldApi, _dt: number) {
    w.drainEvents(PlaySoundEvent, (ev: PlaySoundEvent) => {
        // re-emit so it becomes visible to the NEXT phase
        w.emit(PlaySoundEvent, ev);
    });
}

// render: render the scene
function renderSystem(w: WorldApi, _dt: number) {
    const three = w.requireResource(ThreeResource);
    three.controls.update();
    three.renderer.render(three.scene, three.camera);
    forwardSoundSystem(w, _dt);
}

// audio: consume sound events (here: just log; you’d hook WebAudio)
function audioSystem(w: WorldApi, _dt: number) {
    w.drainEvents(PlaySoundEvent, (ev: PlaySoundEvent) => {
        // Replace with WebAudio / Howler / etc.
        // This demonstrates consuming events at the end of the pipeline.
        console.log(`[audio] play: ${ev.id}`);
        if (ev.id == 'pop') {
            console.log(`[audio] playing: ${ev.id}`);
            const audio = new Audio("./assets/waka.mp3");
            audio.play();
        }
    });
}

// ------------------------------
// Boot
// ------------------------------
function main() {
    const canvas = document.querySelector<HTMLCanvasElement>("#appCanvas")!;
    const world = new World();
    const schedule = new Schedule();

    // Resources
    world.initResource(InputResource, () => new InputResource());
    world.initResource(TextureCacheResource, () => new TextureCacheResource());
    world.initResource(ThreeResource, () => new ThreeResource(canvas));

    // DOM → InputResource
    const three = world.requireResource(ThreeResource);
    const input = world.requireResource(InputResource);

    window.addEventListener("pointerdown", (e) => {
        // only left click
        if (e.button !== 0) return;

        // ignore if pointer is not on the canvas
        if (e.target !== three.renderer.domElement) return;

        input.pushClick(e.clientX, e.clientY, e.button);
    });

    // Initial cubes (immediate spawns to show basic component ops)
    {
        const three = world.requireResource(ThreeResource);
        for (let i = 0; i < 8; i++) {
            const e = world.spawn();
            const pos = new THREE.Vector3(rand(-4, 4), 0.5, rand(-4, 4));
            const mesh = createCubeMesh(0xff8844);
            mesh.position.copy(pos);
            three.scene.add(mesh);
            three.entityByObject.set(mesh, e);

            const tr = new Transform();
            tr.pos.copy(pos);

            world.addMany(e,
                [Transform, tr],
                [MeshRef, new MeshRef(mesh)],
                [Spin, new Spin(rand(-2, 2))],
                [Lifetime, new Lifetime(rand(8, 16))],
                [Clickable, new Clickable()]
            );
        }
        world.flush(); // apply immediate changes (not strictly necessary unless you rely on commands)
    }

    // Schedule phases
    schedule.add("beginFrame", beginFrameSystem);
    schedule.add("input", inputSystem);
    schedule.add("beforeUpdate", pickingSystem);
    schedule.add("update", updateSystem);

    // Forward sound events across boundaries so they reach audio:
    // update -> afterUpdate -> render -> afterRender -> audio
    schedule.add("afterUpdate", forwardSoundSystem);
    schedule.add("render", renderSystem);
    schedule.add("afterRender", forwardSoundSystem);
    schedule.add("audio", audioSystem);

    const phases = ["beginFrame", "input", "beforeUpdate", "update", "afterUpdate", "render", "afterRender", "audio"];

    // Resize handling
    const resize = () => {
        const w = canvas.clientWidth || window.innerWidth;
        const h = canvas.clientHeight || window.innerHeight;
        three.resize(w, h);
    };
    window.addEventListener("resize", resize);
    resize();

    // debugger;

    // Loop
    let last = performance.now();
    function frame(now: number) {
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;

        schedule.run(world, dt, phases);

        requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
}

main();
