import type { CommandsApi, ComponentCtor, ComponentCtorBundleItem, Entity } from "./Types";

export type Command =
    | { k: "spawn"; init?: (e: Entity) => void }
    | { k: "despawn"; e: Entity }
    | { k: "add"; e: Entity; ctor: ComponentCtor<any>; value: any }
    | { k: "remove"; e: Entity; ctor: ComponentCtor<any> };

export class Commands implements CommandsApi
{
    private q: Command[] = [];

    public spawn(init?: (e: Entity) => void): void
    {
        this.q.push({ k: "spawn", init });
    }

    public spawnBundle(...items: ComponentCtorBundleItem[]): void
    {
        this.spawn((e) => {
            // Applied during the same flush thanks to World.flush draining until empty.
            for (const [ctor, value] of items) this.add(e, ctor as any, value as any);
        });
    }

    public despawn(e: Entity): void
    {
        this.q.push({ k: "despawn", e });
    }

    public despawnBundle(entities: Entity[]): void
    {
        for (const e of entities) this.despawn(e);
    }

    public add<T>(e: Entity, ctor: ComponentCtor<T>, value: T): void
    {
        this.q.push({ k: "add", e, ctor, value });
    }

    public addBundle(e: Entity, ...items: ComponentCtorBundleItem[]): void
    {
        for (const [ctor, value] of items) this.add(e, ctor as any, value as any);
    }

    public remove<T>(e: Entity, ctor: ComponentCtor<T>): void
    {
        this.q.push({ k: "remove", e, ctor });
    }

    public removeBundle(e: Entity, ...ctors: ComponentCtor<any>[]): void
    {
        for (const ctor of ctors) this.remove(e, ctor);
    }

    public drain(): Command[]
    {
        const out = this.q;
        this.q = [];
        return out;
    }
}
