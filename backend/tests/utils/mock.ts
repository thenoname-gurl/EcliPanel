export type FindOptions = {
  where?: Record<string, unknown> | Partial<Record<string, unknown>>;
  order?: Record<string, 'ASC' | 'DESC'>;
  take?: number;
};

export type MockRepository<T = unknown> = {
  create: (entity?: Partial<T>) => T;
  save: (entity: T) => Promise<T>;
  find: (options?: FindOptions) => Promise<T[]>;
  findOne: (options?: FindOptions) => Promise<T | null>;
  findOneBy: (where: Partial<T> | Record<string, unknown>) => Promise<T | null>;
  findBy: (where: Partial<T> | Record<string, unknown>) => Promise<T[]>;
  update: (criteria: Partial<T> | number | string, partial: Partial<T>) => Promise<{ affected: number }>;
  delete: (criteria: Partial<T> | number | string) => Promise<{ affected: number }>;
  remove: (entity: T) => Promise<T>;
  count: (options?: FindOptions) => Promise<number>;
  query: (sql: string, parameters?: unknown[]) => Promise<unknown[]>;
  insert: (entity: Partial<T> | T) => Promise<{ identifiers: Array<{ id: number }> }>;
  upsert: (
    entityOrEntities: Partial<T> | Partial<T>[],
    conflictPathsOrOptions: string | string[]
  ) => Promise<{ identifiers: Array<{ id: number }> }>;
  [key: string]: unknown;
};

export function createMockRepository<T = unknown>(initialData: T[] = []): MockRepository<T> {
  let data: T[] = [...initialData];
  let nextId = 1;

  const repo: MockRepository<T> = {
    create: (entity?: Partial<T>) => ({
      id: nextId++,
      ...entity,
      createdAt: new Date(),
    } as unknown as T),

    save: async (entity: T) => {
      const idx = data.findIndex(d => (d as unknown as Record<string, unknown>).id === (entity as unknown as Record<string, unknown>).id);
      if (idx >= 0) {
        data[idx] = { ...entity };
      } else {
        if ((entity as unknown as Record<string, unknown>).id === undefined) {
          (entity as unknown as Record<string, unknown>).id = nextId++ as unknown as number;
        }
        data.push(entity);
      }
      return entity;
    },

    find: async (options?: FindOptions) => {
      let result = [...data];
      if (options?.where) {
        const where = options.where as Record<string, unknown>;
        result = result.filter(item => {
          for (const [key, value] of Object.entries(where)) {
            if (value !== undefined && (item as unknown as Record<string, unknown>)[key] !== value) return false;
          }
          return true;
        });
      }
      if (options?.order) {
        const [sortKey, sortDir] = Object.entries(options.order!)[0] as [string, 'ASC' | 'DESC'];
        result.sort((a, b) => {
          const aVal = (a as unknown as Record<string, unknown>)[sortKey];
          const bVal = (b as unknown as Record<string, unknown>)[sortKey];
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

    findOne: async (options?: FindOptions) => {
      let result = [...data];
      if (options?.where) {
        const where = options.where as Record<string, unknown>;
        result = result.filter(item => {
          for (const [key, value] of Object.entries(where)) {
            if (value !== undefined && (item as unknown as Record<string, unknown>)[key] !== value) return false;
          }
          return true;
        });
      }
      if (options?.order) {
        const [sortKey, sortDir] = Object.entries(options.order!)[0] as [string, 'ASC' | 'DESC'];
        result.sort((a, b) => {
          const aVal = (a as unknown as Record<string, unknown>)[sortKey];
          const bVal = (b as unknown as Record<string, unknown>)[sortKey];
          if (aVal < bVal) return sortDir === 'ASC' ? -1 : 1;
          if (aVal > bVal) return sortDir === 'ASC' ? 1 : -1;
          return 0;
        });
      }
      return result[0] || null;
    },

    findOneBy: async (where: Partial<T> | Record<string, unknown>) => {
      const whereObj = where as Record<string, unknown>;
      for (const item of data) {
        let match = true;
        for (const [key, value] of Object.entries(whereObj)) {
          if (value !== undefined && (item as unknown as Record<string, unknown>)[key] !== value) {
            match = false;
            break;
          }
        }
        if (match) return item;
      }
      return null;
    },

    findBy: async (where: Partial<T> | Record<string, unknown>) => {
      const whereObj = where as Record<string, unknown>;
      return data.filter(item => {
        for (const [key, value] of Object.entries(whereObj)) {
          if (value !== undefined && (item as unknown as Record<string, unknown>)[key] !== value) return false;
        }
        return true;
      });
    },

    update: async (criteria: Partial<T> | number | string, partial: Partial<T>) => {
      const criteriaObj = typeof criteria === 'object' ? (criteria as Record<string, unknown>) : { id: criteria };
      let affected = 0;
      data = data.map(item => {
        let match = true;
        for (const [key, value] of Object.entries(criteriaObj)) {
          if (value !== undefined && (item as unknown as Record<string, unknown>)[key] !== value) {
            match = false;
            break;
          }
        }
        if (match) {
          affected++;
          return { ...item, ...(partial as unknown as T) } as T;
        }
        return item;
      });
      return { affected };
    },

    delete: async (criteria: Partial<T> | number | string) => {
      const criteriaObj = typeof criteria === 'object' ? (criteria as Record<string, unknown>) : { id: criteria };
      const before = data.length;
      data = data.filter(item => {
        for (const [key, value] of Object.entries(criteriaObj)) {
          if (value !== undefined && (item as unknown as Record<string, unknown>)[key] !== value) return true;
        }
        return false;
      });
      return { affected: before - data.length };
    },

    remove: async (entity: T) => {
      const id = (entity as unknown as Record<string, unknown>).id as unknown as number | undefined;
      data = data.filter(item => (item as unknown as Record<string, unknown>).id !== id);
      return entity;
    },

    count: async (options?: FindOptions) => {
      let result = [...data];
      if (options?.where) {
        const where = options.where as Record<string, unknown>;
        result = result.filter(item => {
          for (const [key, value] of Object.entries(where)) {
            if (value !== undefined && (item as unknown as Record<string, unknown>)[key] !== value) return false;
          }
          return true;
        });
      }
      return result.length;
    },

    query: async (sql: string, parameters?: unknown[]) => {
      if (sql === 'SELECT 1') return [{ '1': 1 }];
      return [];
    },

    insert: async (entity: Partial<T> | T) => {
      const e = entity as unknown as Record<string, unknown>;
      if (e.id === undefined) {
        e.id = nextId++ as unknown as number;
      }
      data.push(entity as T);
      return { identifiers: [{ id: e.id as unknown as number }] };
    },

    upsert: async (entityOrEntities: Partial<T> | Partial<T>[], conflictPathsOrOptions: string | string[]) => {
      const entities = Array.isArray(entityOrEntities) ? entityOrEntities : [entityOrEntities];
      for (const entity of entities) {
        await repo.save(entity as unknown as T);
      }
      return { identifiers: entities.map(e => ({ id: Number((e as unknown as Record<string, unknown>).id) || nextId++ })) };
    },
  };

  return repo;
}

type MockDataSource = {
  getRepository: (entity: Function | string) => MockRepository<unknown>;
  isInitialized: boolean;
  initialize: () => Promise<void>;
  destroy: () => Promise<void>;
  query: (sql: string, parameters?: unknown[]) => Promise<unknown[]>;
  transaction: (runInTransaction: (manager: unknown) => Promise<unknown>) => Promise<unknown>;
  manager: unknown;
};

  const globalMocks: Record<string, MockRepository<unknown>> = {};

export function mockDataSource(): MockDataSource {
  const dataSource: MockDataSource = {
    isInitialized: true,
    initialize: async () => {},
    destroy: async () => {},
    query: async (sql: string, parameters?: unknown[]) => {
      if (sql === 'SELECT 1') return [{ '1': 1 }];
      return [];
    },
    transaction: async (runInTransaction: (manager: unknown) => Promise<unknown>) => {
      return runInTransaction(dataSource.manager);
    },
    getRepository: (entity: Function | string) => {
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

export function setMockData(entityName: string, data: unknown[]): void {
  globalMocks[entityName] = createMockRepository(data as unknown[]);
}

export function getMockRepository(entityName: string): MockRepository<unknown> {
  if (!globalMocks[entityName]) {
    globalMocks[entityName] = createMockRepository();
  }
  return globalMocks[entityName];
}
