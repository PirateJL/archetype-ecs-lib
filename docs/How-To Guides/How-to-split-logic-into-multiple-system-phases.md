# How to split logic into multiple system phases

1. Create a `Schedule` and register systems by phase name:

```ts
const sched = new Schedule();

sched
  .add("input", (w: any) => { /* ... */ })
  .add("sim",   (w: any, dt: number) => { /* ... */ })
  .add("render",(w: any) => { /* ... */ });
```

2. Define phase order:

```ts
const phases = ["input", "sim", "render"];
```

3. Run it each tick (flush happens after each phase):

```ts
sched.run(world, dt, phases);
```
