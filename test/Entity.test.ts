import { Entity } from '../src/ecs/Types';
import { World } from '../src/ecs/World';

describe('Entity', () => {
    let entity: Entity

    beforeEach(() => {
        const world = new World();
        entity = world.spawn();
    });
    
    it('should create an entity with an id of 1', () => {
        expect(entity).toBeDefined();
        expect(entity.id).toBe(1);
    });
});