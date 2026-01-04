# How to despawn entities safely

1. Despawn **immediately** when not iterating:

```ts
world.despawn(e);
```

2. Despawn **during a query/system** via `cmd()`:

```ts
world.addSystem((w: any) => {
  for (const { e, c1: pos } of w.query(Position)) {
    if (pos.x > 10) w.cmd().despawn(e);
  }
});

// apply despawns
world.flush();
```

3. Or rely on end-of-frame flush:

```ts
world.update(dt); // runs systems, then flushes
```
