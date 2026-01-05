# How to add/remove components at runtime

1. Define your component types (classes):

```ts
class Position { constructor(public x = 0, public y = 0) {} }
class Velocity { constructor(public x = 0, public y = 0) {} }
```

2. Add/remove **immediately** when you are **not** iterating a query:

```ts
const e = world.spawn();
world.add(e, Position, new Position(0, 0));
world.add(e, Velocity, new Velocity(1, 0));

world.remove(e, Velocity);
```

3. Add/remove **during a query/system** using **deferred commands**:

```ts
world.addSystem((w: any) => {
  for (const { e, c1: pos } of w.query(Position)) {
    if (pos.x > 10) w.cmd().add(e, Velocity, new Velocity(1, 0));
    if (pos.x < 0)  w.cmd().remove(e, Velocity);
  }
});

// apply queued structural changes
world.flush();
```
