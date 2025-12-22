import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { World, Schedule } from "../src/index";

/** ----- Components ----- */
class TransformComponent {
    position = new THREE.Vector3();
    rotation = new THREE.Euler();
    scale = new THREE.Vector3(1, 1, 1);
}

class ThreeObjectComponent {
    constructor(public obj: THREE.Object3D) {}
}

class SpinComponent {
    constructor(public yRadPerSec: number = 1.5) {}
}

/** "Resource" component stored on a singleton entity */
class RenderContextComponent {
    constructor(
        public scene: THREE.Scene,
        public camera: THREE.PerspectiveCamera,
        public renderer: THREE.WebGLRenderer,
        public controls: OrbitControls
    ) {}
}

/** ----- Three.js bootstrap ----- */
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111111);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(2, 1.5, 3);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.style.margin = "0";
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 0, 0);

// Lights
scene.add(new THREE.AmbientLight(0xffffff, 0.4));
const dir = new THREE.DirectionalLight(0xffffff, 1.0);
dir.position.set(2, 2, 2);
scene.add(dir);

/** ----- ECS World ----- */
const world = new World();
const schedule = new Schedule();

/** Create "resources entity" */
const res = world.spawn();
world.add(res, RenderContextComponent, new RenderContextComponent(scene, camera, renderer, controls));

/** Create cube entity */
const cubeMesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0x4aa3ff })
);
scene.add(cubeMesh);

const cube = world.spawn();
const t = new TransformComponent();
t.position.set(0, 0, 0);
world.add(cube, TransformComponent, t);
world.add(cube, SpinComponent, new SpinComponent(1.8));
world.add(cube, ThreeObjectComponent, new ThreeObjectComponent(cubeMesh));

/** ----- Systems ----- */
// NOTE: your SystemFn is typed with WorldI (minimal), so we cast to World to use query().
const spinSystem = (w: any, dt: number) => {
    const world = w as World;
    for (const { c1: tr, c2: spin } of world.query(TransformComponent, SpinComponent)) {
        tr.rotation.y += spin.yRadPerSec * dt;
    }
};

const syncTransformToThreeSystem = (w: any) => {
    const world = w as World;
    for (const { c1: tr, c2: obj } of world.query(TransformComponent, ThreeObjectComponent)) {
        obj.obj.position.copy(tr.position);
        obj.obj.rotation.copy(tr.rotation);
        obj.obj.scale.copy(tr.scale);
    }
};

const renderSystem = (w: any) => {
    const world = w as World;
    for (const { c1: ctx } of world.query(RenderContextComponent)) {
        ctx.controls.update();
        ctx.renderer.render(ctx.scene, ctx.camera);
        break; // singleton
    }
};

/** Schedule phases */
schedule
  .add("update", spinSystem)
  .add("sync", syncTransformToThreeSystem)
  .add("render", renderSystem);

/** ----- Game loop ----- */
let last = performance.now();
function frame(now: number) {
    const dt = (now - last) / 1000;
    last = now;

    schedule.run(world, dt, ["update", "sync", "render"]);
    requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

/** Resize */
window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
