import { Archetype } from "./Archetype";
import { Commands } from "./Commands";
import { EntityManager } from "./EntityManager";
import { EventChannel } from "./Events";
import { typeId } from "./TypeRegistry";
import type {
    ComponentCtor,
    Signature,
    SnapshotCodec,
    TypeId,
    WorldSnapshot
} from "./Types";

const WORLD_SNAPSHOT_FORMAT: WorldSnapshot["format"] = "archetype-ecs/world-snapshot@1";

type ComponentSnapshotRegistration = Readonly<{
    key: string;
    tid: TypeId;
    serialize: (value: any) => unknown;
    deserialize: (data: unknown) => any;
}>;

type ResourceSnapshotRegistration = Readonly<{
    key: string;
    serialize: (value: any) => unknown;
    deserialize: (data: unknown) => any;
}>;

export type WorldSnapshotRuntime = Readonly<{
    ensureNotIterating(op: string): void;
    formatCtor(ctor: ComponentCtor<any>): string;
    flush(): void;
    resetArchetypes(): void;
    getOrCreateArchetype(sig: Signature): Archetype;
    commands: Commands;
    entities: EntityManager;
    archetypes: Archetype[];
    resources: Map<ComponentCtor<any>, any>;
    eventChannels: Map<ComponentCtor<any>, EventChannel<any>>;
}>;

export class WorldSnapshotStore
{
    private readonly componentSnapshotByCtor = new Map<ComponentCtor<any>, ComponentSnapshotRegistration>();
    private readonly componentSnapshotCtorByKey = new Map<string, ComponentCtor<any>>();
    private readonly resourceSnapshotByCtor = new Map<ComponentCtor<any>, ResourceSnapshotRegistration>();
    private readonly resourceSnapshotCtorByKey = new Map<string, ComponentCtor<any>>();

    public registerComponentSnapshot<T, D = unknown>(
        runtime: Pick<WorldSnapshotRuntime, "formatCtor">,
        key: ComponentCtor<T>,
        codec: SnapshotCodec<T, D>
    ): void
    {
        const snapshotKey = this._normalizeSnapshotKey(codec.key, "component");
        const existingCtor = this.componentSnapshotCtorByKey.get(snapshotKey);
        if (existingCtor && existingCtor !== key) {
            throw new Error(`registerComponentSnapshot(${snapshotKey}) failed: key already used by ${runtime.formatCtor(existingCtor)}`);
        }

        const prev = this.componentSnapshotByCtor.get(key);
        if (prev && prev.key !== snapshotKey) this.componentSnapshotCtorByKey.delete(prev.key);

        this.componentSnapshotByCtor.set(key, {
            key: snapshotKey,
            tid: typeId(key),
            serialize: (value: any) => codec.serialize(value as T),
            deserialize: (data: unknown) => codec.deserialize(data as D)
        });
        this.componentSnapshotCtorByKey.set(snapshotKey, key);
    }

    public unregisterComponentSnapshot<T>(key: ComponentCtor<T>): boolean
    {
        const prev = this.componentSnapshotByCtor.get(key);
        if (!prev) return false;
        this.componentSnapshotByCtor.delete(key);
        this.componentSnapshotCtorByKey.delete(prev.key);
        return true;
    }

    public registerResourceSnapshot<T, D = unknown>(
        runtime: Pick<WorldSnapshotRuntime, "formatCtor">,
        key: ComponentCtor<T>,
        codec: SnapshotCodec<T, D>
    ): void
    {
        const snapshotKey = this._normalizeSnapshotKey(codec.key, "resource");
        const existingCtor = this.resourceSnapshotCtorByKey.get(snapshotKey);
        if (existingCtor && existingCtor !== key) {
            throw new Error(`registerResourceSnapshot(${snapshotKey}) failed: key already used by ${runtime.formatCtor(existingCtor)}`);
        }

        const prev = this.resourceSnapshotByCtor.get(key);
        if (prev && prev.key !== snapshotKey) this.resourceSnapshotCtorByKey.delete(prev.key);

        this.resourceSnapshotByCtor.set(key, {
            key: snapshotKey,
            serialize: (value: any) => codec.serialize(value as T),
            deserialize: (data: unknown) => codec.deserialize(data as D)
        });
        this.resourceSnapshotCtorByKey.set(snapshotKey, key);
    }

    public unregisterResourceSnapshot<T>(key: ComponentCtor<T>): boolean
    {
        const prev = this.resourceSnapshotByCtor.get(key);
        if (!prev) return false;
        this.resourceSnapshotByCtor.delete(key);
        this.resourceSnapshotCtorByKey.delete(prev.key);
        return true;
    }

    public snapshot(runtime: Pick<WorldSnapshotRuntime,
        "ensureNotIterating" |
        "flush" |
        "commands" |
        "archetypes" |
        "entities" |
        "resources"
    >): WorldSnapshot
    {
        runtime.ensureNotIterating("snapshot");
        if (runtime.commands.hasPending()) runtime.flush();

        type SerializedComponentColumn = {
            type: string;
            column: any[];
            serialize: (value: any) => unknown;
        };

        const componentRegs: ComponentSnapshotRegistration[] = [];
        for (const [, reg] of this.componentSnapshotByCtor) componentRegs.push(reg);
        componentRegs.sort((a, b) => a.key.localeCompare(b.key));

        const serializedColumnsByArch = new Map<number, SerializedComponentColumn[]>();
        for (const a of runtime.archetypes) {
            if (!a) continue;
            const cols: SerializedComponentColumn[] = [];
            for (const reg of componentRegs) {
                if (!a.has(reg.tid)) continue;
                cols.push({
                    type: reg.key,
                    column: a.column<any>(reg.tid),
                    serialize: reg.serialize
                });
            }
            serializedColumnsByArch.set(a.id, cols);
        }

        const entities: Array<{ id: number; gen: number; components: Array<{ type: string; data: unknown }> }> = [];
        for (let id = 1; id < runtime.entities.meta.length; id++) {
            const m = runtime.entities.meta[id];
            if (!m || !m.alive) continue;

            const cols = serializedColumnsByArch.get(m.arch) ?? [];
            const components: Array<{ type: string; data: unknown }> = new Array(cols.length);
            for (let i = 0; i < cols.length; i++) {
                const c = cols[i]!;
                components[i] = {
                    type: c.type,
                    data: c.serialize(c.column[m.row])
                };
            }

            entities.push({ id, gen: m.gen, components });
        }

        const resourceRegs: Array<{ ctor: ComponentCtor<any>; reg: ResourceSnapshotRegistration }> = [];
        for (const [ctor, reg] of this.resourceSnapshotByCtor) resourceRegs.push({ ctor, reg });
        resourceRegs.sort((a, b) => a.reg.key.localeCompare(b.reg.key));

        const resources: Array<{ type: string; data: unknown }> = [];
        for (const entry of resourceRegs) {
            if (!runtime.resources.has(entry.ctor)) continue;
            resources.push({
                type: entry.reg.key,
                data: entry.reg.serialize(runtime.resources.get(entry.ctor))
            });
        }

        return {
            format: WORLD_SNAPSHOT_FORMAT,
            allocator: runtime.entities.snapshotAllocator(),
            entities,
            resources
        };
    }

    public restore(runtime: Pick<WorldSnapshotRuntime,
        "ensureNotIterating" |
        "commands" |
        "eventChannels" |
        "resources" |
        "entities" |
        "resetArchetypes" |
        "getOrCreateArchetype"
    >, snapshot: WorldSnapshot): void
    {
        runtime.ensureNotIterating("restore");

        if (snapshot.format !== WORLD_SNAPSHOT_FORMAT) {
            throw new Error(
                `Unsupported world snapshot format "${snapshot.format}". ` +
                `Expected "${WORLD_SNAPSHOT_FORMAT}".`
            );
        }

        runtime.commands.drain();
        for (const ch of runtime.eventChannels.values()) ch.clearAll();

        runtime.resources.clear();
        runtime.entities.restoreAllocator(snapshot.allocator);
        runtime.resetArchetypes();

        const seenResourceTypes = new Set<string>();
        for (const resource of snapshot.resources) {
            if (seenResourceTypes.has(resource.type)) {
                throw new Error(`Duplicate snapshot resource type "${resource.type}"`);
            }
            seenResourceTypes.add(resource.type);

            const ctor = this.resourceSnapshotCtorByKey.get(resource.type);
            if (!ctor) {
                throw new Error(`Missing resource snapshot codec for "${resource.type}". Register it before restore().`);
            }
            const reg = this.resourceSnapshotByCtor.get(ctor)!;
            runtime.resources.set(ctor, reg.deserialize(resource.data));
        }

        const freeSet = new Set<number>(snapshot.allocator.free);
        const seenEntityIds = new Set<number>();
        for (const entity of snapshot.entities) {
            if (!Number.isInteger(entity.id) || entity.id <= 0) {
                throw new Error(`Invalid snapshot entity id: ${entity.id}`);
            }
            if (!Number.isInteger(entity.gen) || entity.gen <= 0) {
                throw new Error(`Invalid snapshot entity generation for id ${entity.id}: ${entity.gen}`);
            }
            if (seenEntityIds.has(entity.id)) {
                throw new Error(`Duplicate snapshot entity id ${entity.id}`);
            }
            seenEntityIds.add(entity.id);

            if (freeSet.has(entity.id)) {
                throw new Error(`Invalid snapshot: entity id ${entity.id} is both alive and free`);
            }

            const meta = runtime.entities.meta[entity.id];
            if (!meta) {
                throw new Error(
                    `Invalid snapshot: missing allocator generation entry for entity id ${entity.id}. ` +
                    `Ensure snapshot.allocator.generations includes all alive ids.`
                );
            }

            const componentValues = new Map<TypeId, any>();
            const seenComponentTypes = new Set<string>();
            for (const component of entity.components) {
                if (seenComponentTypes.has(component.type)) {
                    throw new Error(`Duplicate component type "${component.type}" on entity ${entity.id}`);
                }
                seenComponentTypes.add(component.type);

                const ctor = this.componentSnapshotCtorByKey.get(component.type);
                if (!ctor) {
                    throw new Error(`Missing component snapshot codec for "${component.type}". Register it before restore().`);
                }
                const reg = this.componentSnapshotByCtor.get(ctor)!;
                componentValues.set(reg.tid, reg.deserialize(component.data));
            }

            const sig = Array.from(componentValues.keys()).sort((a, b) => a - b);
            const a = runtime.getOrCreateArchetype(sig);
            const row = a.addRow({ id: entity.id, gen: entity.gen });
            for (const t of sig) a.column<any>(t).push(componentValues.get(t));

            meta.alive = true;
            meta.gen = entity.gen;
            meta.arch = a.id;
            meta.row = row;
        }
    }

    private _normalizeSnapshotKey(key: string, kind: "component" | "resource"): string
    {
        const normalized = key.trim();
        if (normalized.length === 0) {
            throw new Error(`register${kind === "component" ? "Component" : "Resource"}Snapshot() failed: codec.key must be a non-empty string`);
        }
        return normalized;
    }
}
