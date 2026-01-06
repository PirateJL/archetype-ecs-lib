import type { CommandsApi, ComponentCtor, Entity } from "./Types";

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

    public despawn(e: Entity): void
    {
        this.q.push({ k: "despawn", e });
    }

    public add<T>(e: Entity, ctor: ComponentCtor<T>, value: T): void
    {
        this.q.push({ k: "add", e, ctor, value });
    }

    public remove<T>(e: Entity, ctor: ComponentCtor<T>): void
    {
        this.q.push({ k: "remove", e, ctor });
    }

    public drain(): Command[]
    {
        const out = this.q;
        this.q = [];
        return out;
    }
}
