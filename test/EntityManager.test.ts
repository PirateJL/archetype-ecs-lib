import { Entity } from '../src/ecs/Types';
import { World } from '../src/ecs/World';

describe('Entity', () => {
    let world: World;
    let entity: Entity;

    beforeEach(() => {
        world = new World();
        entity = world.spawn();
    });
    
    it('should spawn an entity with an id of 1', () => {
        expect(entity).toBeDefined();
        expect(entity.id).toBe(1);
    });

    it('the created entity should be alive', () => {
        expect(world.isAlive(entity)).toBe(true);
    });

    it('should despawn the entity of an id of 1', () => {
        expect(entity).toBeDefined();
        world.despawn(entity);
        expect(world.isAlive(entity)).toBe(false);
    });
});