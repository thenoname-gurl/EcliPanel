export type MockRepository<T = any> = {
  create: (entity?: Partial<T>) => T;
  save: (entity: T) => Promise<T>;
  find: (options?: any) => Promise<T[]>;
  findOne: (options: any) => Promise<T | null>;
  findOneBy: (where: any) => Promise<T | null>;
  findBy: (where: any) => Promise<T[]>;
  update: (criteria: any, partial: Partial<T>) => Promise<any>;
  delete: (criteria: any) => Promise<any>;
  remove: (entity: T) => Promise<T>;
  count: (options?: any) => Promise<number>;
  query: (sql: string, parameters?: any[]) => Promise<any>;
  insert: (entity: any) => Promise<any>;
  upsert: (entityOrEntities: any, conflictPathsOrOptions: string | string[]) => Promise<any>;
  [key: string]: any;
};

export function createMockRepository<T = any>(initialData: T[] = []): MockRepository<T> {
  let data: T[] = [...initialData];
  let nextId = 1;

  const repo: MockRepository<T> = {
    create: (entity?: Partial<T>) => ({
      id: nextId++,
      ...entity,
      createdAt: new Date(),
    } as unknown as T),

    save: async (entity: T) => {
      const idx = data.findIndex((d: any) => d.id === (entity as any).id);
      if (idx >= 0) {
        data[idx] = { ...entity };
      } else {
        if (!(entity as any).id) {
          (entity as any).id = nextId++;
        }
        data.push(entity);
      }
      return entity;
    },

    find: async (options?: any) => {
      let result = [...data];
      if (options?.where) {
        result = result.filter((item: any) => {
          for (const [key, value] of Object.entries(options.where as Record<string, any>)) {
            if (value !== undefined && item[key] !== value) return false;
          }
          return true;
        });
      }
      if (options?.order) {
        const [sortKey, sortDir] = Object.entries(options.order)[0] as [string, 'ASC' | 'DESC'];
        result.sort((a: any, b: any) => {
          const aVal = a[sortKey];
          const bVal = b[sortKey];
          if (aVal < bVal) return sortDir === 'ASC' ? -1 : 1;
          if (aVal > bVal) return sortDir === 'ASC' ? 1 : -1;
          return 0;
        });
      }
      if (options?.take !== undefined) {
        result = result.slice(0, options.take);
      }
      return result;
    },

    findOne: async (options: any) => {
      let result = [...data];
      if (options?.where) {
        result = result.filter((item: any) => {
          for (const [key, value] of Object.entries(options.where as Record<string, any>)) {
            if (value !== undefined && item[key] !== value) return false;
          }
          return true;
        });
      }
      if (options?.order) {
        const [sortKey, sortDir] = Object.entries(options.order)[0] as [string, 'ASC' | 'DESC'];
        result.sort((a: any, b: any) => {
          const aVal = a[sortKey];
          const bVal = b[sortKey];
          if (aVal < bVal) return sortDir === 'ASC' ? -1 : 1;
          if (aVal > bVal) return sortDir === 'ASC' ? 1 : -1;
          return 0;
        });
      }
      return result[0] || null;
    },

    findOneBy: async (where: any) => {
      for (const item of data) {
        let match = true;
        for (const [key, value] of Object.entries(where as Record<string, any>)) {
          if (value !== undefined && (item as any)[key] !== value) {
            match = false;
            break;
          }
        }
        if (match) return item;
      }
      return null;
    },

    findBy: async (where: any) => {
      return data.filter((item: any) => {
        for (const [key, value] of Object.entries(where as Record<string, any>)) {
          if (value !== undefined && item[key] !== value) return false;
        }
        return true;
      });
    },

    update: async (criteria: any, partial: Partial<T>) => {
      const criteriaObj = typeof criteria === 'object' ? criteria : { id: criteria };
      let affected = 0;
      data = data.map((item: any) => {
        let match = true;
        for (const [key, value] of Object.entries(criteriaObj)) {
          if (value !== undefined && item[key] !== value) {
            match = false;
            break;
          }
        }
        if (match) {
          affected++;
          return { ...item, ...partial };
        }
        return item;
      });
      return { affected };
    },

    delete: async (criteria: any) => {
      const criteriaObj = typeof criteria === 'object' ? criteria : { id: criteria };
      const before = data.length;
      data = data.filter((item: any) => {
        for (const [key, value] of Object.entries(criteriaObj)) {
          if (value !== undefined && item[key] !== value) return true;
        }
        return false;
      });
      return { affected: before - data.length };
    },

    remove: async (entity: T) => {
      const id = (entity as any).id;
      data = data.filter((item: any) => item.id !== id);
      return entity;
    },

    count: async (options?: any) => {
      let result = [...data];
      if (options?.where) {
        result = result.filter((item: any) => {
          for (const [key, value] of Object.entries(options.where as Record<string, any>)) {
            if (value !== undefined && item[key] !== value) return false;
          }
          return true;
        });
      }
      return result.length;
    },

    query: async (sql: string, parameters?: any[]) => {
      if (sql === 'SELECT 1') return [{ '1': 1 }];
      return [];
    },

    insert: async (entity: any) => {
      if (!entity.id) {
        entity.id = nextId++;
      }
      data.push(entity);
      return { identifiers: [{ id: entity.id }] };
    },

    upsert: async (entityOrEntities: any, conflictPathsOrOptions: string | string[]) => {
      const entities = Array.isArray(entityOrEntities) ? entityOrEntities : [entityOrEntities];
      for (const entity of entities) {
        await repo.save(entity);
      }
      return { identifiers: entities.map((e: any) => ({ id: e.id || nextId++ })) };
    },
  };

  return repo;
}

type MockDataSource = {
  getRepository: (entity: any) => MockRepository;
  isInitialized: boolean;
  initialize: () => Promise<void>;
  destroy: () => Promise<void>;
  query: (sql: string, parameters?: any[]) => Promise<any>;
  transaction: (runInTransaction: (manager: any) => Promise<any>) => Promise<any>;
  manager: any;
};

const globalMocks: Record<string, MockRepository> = {};

export function mockDataSource(): MockDataSource {
  const dataSource: MockDataSource = {
    isInitialized: true,
    initialize: async () => {},
    destroy: async () => {},
    query: async (sql: string, parameters?: any[]) => {
      if (sql === 'SELECT 1') return [{ '1': 1 }];
      return [];
    },
    transaction: async (runInTransaction: (manager: any) => Promise<any>) => {
      return runInTransaction(dataSource.manager);
    },
    getRepository: (entity: any) => {
      const entityName = typeof entity === 'function' ? entity.name : String(entity);
      if (!globalMocks[entityName]) {
        globalMocks[entityName] = createMockRepository();
      }
      return globalMocks[entityName];
    },
    manager: {},
  };

  return dataSource;
}

export function clearAllMocks(): void {
  for (const key of Object.keys(globalMocks)) {
    delete globalMocks[key];
  }
}

export function setMockData(entityName: string, data: any[]): void {
  globalMocks[entityName] = createMockRepository(data);
}

export function getMockRepository(entityName: string): MockRepository {
  if (!globalMocks[entityName]) {
    globalMocks[entityName] = createMockRepository();
  }
  return globalMocks[entityName];
}
