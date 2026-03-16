## Architecture Overview

    World — Central owner of all ECS state
    │
    ├── EntityManager        ID + generation counter; free-list allocator
    │
    ├── Archetypes           One table per unique component set; SoA columns; add/remove edge cache
    │   └── Query Cache      Incremental archetype matching; invalidated on new archetype
    │
    ├── TypeRegistry         Maps component constructor → TypeId; used to build signatures
    │
    ├── Resources            Global singletons; keyed by constructor
    │
    ├── Event Channels       Double-buffered per type; write this phase → read next phase
    │
    ├── Commands             Deferred queue (spawn · despawn · add · remove); flushed after each phase
    │
    ├── Snapshot Store       Opt-in serialize / restore; codec registered per type
    │
    ├── StatsOverlay         Per-frame profiling; optional DOM HUD
    │
    ├── world.update(dt)     Single-phase loop; auto flush + swap events
    │   └── SystemFn[]
    │
    └── Schedule             Multi-phase; topological ordering; .after() / .before() constraints;
        │                    phase boundaries auto-flush
        └── Phase → SystemFn[]


Data flow per frame

    ┌─────────────────────────────────────────────────────┐
    │                      Frame                          │
    │                                                     │
    │  Systems run                                        │
    │    └─ query() / queryTables() / queryEach()         │
    │         └─ matches archetypes via Query Cache       │
    │                                                     │
    │  Structural changes during iteration?               │
    │    └─ enqueue via world.cmd()                       │
    │         └─ applied by world.flush()                 │
    │              └─ moves entities between archetypes   │
    │                                                     │
    │  Events emitted this phase                          │
    │    └─ become readable next phase after swap         │
    └─────────────────────────────────────────────────────┘

Two update modes (mutually exclusive)

    ┌────────────┬───────────────────────────┬────────────────────────────────┐
    │            │     world.update(dt)      │    schedule.run(world, dt)     │
    ├────────────┼───────────────────────────┼────────────────────────────────┤
    │ Phases     │ Single                    │ Multiple, ordered              │
    ├────────────┼───────────────────────────┼────────────────────────────────┤
    │ Flush      │ Once at end of frame      │ After each phase               │
    ├────────────┼───────────────────────────┼────────────────────────────────┤
    │ Event swap │ Once at end of frame      │ After each phase               │
    ├────────────┼───────────────────────────┼────────────────────────────────┤
    │ Use case   │ Simple loop / prototyping │ Production, multi-system games │
    └────────────┴───────────────────────────┴────────────────────────────────┘
