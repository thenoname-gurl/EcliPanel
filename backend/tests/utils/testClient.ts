import { Elysia } from 'elysia';
import { User } from '../../src/models/user.entity';
import { createTestUser } from './fixtures';

export type TestRequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  body?: any;
  query?: Record<string, string>;
  cookies?: Record<string, string>;
  user?: User | null;
  apiKey?: any;
  permissions?: string[];
};

export type TestResponse = {
  status: number;
  headers: Headers;
  body: any;
  json: () => Promise<any>;
  text: () => Promise<string>;
};

export class TestClient {
  private app: Elysia | null = null;
  private baseUrl: string = 'http://localhost';

  constructor(app?: Elysia) {
    if (app) {
      this.app = app;
    }
  }

  setApp(app: Elysia): void {
    this.app = app;
  }

  createContext(options: TestRequestOptions = {}): any {
    const user = options.user ?? null;
    const userPermissions = options.permissions ?? (user ? this.getUserPermissions(user) : []);

    const headers: Record<string, string> = {
      'content-type': options.body ? 'application/json' : 'text/plain',
      ...options.headers,
    };

    return {
      headers,
      set: {
        status: 200,
        headers: {} as Record<string, string>,
      },
      cookie: options.cookies || {},
      body: options.body,
      query: options.query || {},
      params: {},
      user,
      apiKey: options.apiKey,
      userPermissions,
      jwtPayload: user ? { userId: user.id, sessionId: 'test-session' } : undefined,
      t: (key: string, defaultValue?: string) => defaultValue || key,
      log: console,
    };
  }

  private getUserPermissions(user: User): string[] {
    const permissions: string[] = [];
    const userRoles = (user as any).userRoles;
    if (Array.isArray(userRoles)) {
      for (const ur of userRoles) {
        const role = (ur as any).role;
        if (role?.permissions) {
          for (const perm of role.permissions) {
            if (typeof perm.value === 'string') {
              permissions.push(perm.value);
            }
          }
        }
      }
    }
    return permissions;
  }

  async request(
    path: string,
    options: TestRequestOptions = {}
  ): Promise<TestResponse> {
    if (!this.app) {
      throw new Error('TestClient: app not set. Use setApp() or pass app to constructor.');
    }

    const method = options.method || 'GET';
    let url = this.baseUrl + path;

    if (options.query) {
      const searchParams = new URLSearchParams(options.query);
      const separator = url.includes('?') ? '&' : '?';
      url += separator + searchParams.toString();
    }

    const headers = new Headers({
      'content-type': options.body ? 'application/json' : 'text/plain',
      ...options.headers,
    });

    if (options.user) {
      headers.set('authorization', `Bearer test-jwt-token`);
    }

    const requestInit: RequestInit = {
      method,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    };

    const request = new Request(url, requestInit);
    const response = await this.app.handle(request);

    const responseClone = response.clone();
    let parsedBody: any = null;

    try {
      parsedBody = await responseClone.json();
    } catch {
      parsedBody = await responseClone.text();
    }

    return {
      status: response.status,
      headers: response.headers,
      body: parsedBody,
      json: async () => {
        try {
          return await response.clone().json();
        } catch {
          const text = await response.clone().text();
          return { rawText: text };
        }
      },
      text: () => response.clone().text(),
    };
  }

  get(path: string, options: Omit<TestRequestOptions, 'method'> = {}): Promise<TestResponse> {
    return this.request(path, { ...options, method: 'GET' });
  }

  post(path: string, options: Omit<TestRequestOptions, 'method'> = {}): Promise<TestResponse> {
    return this.request(path, { ...options, method: 'POST' });
  }

  put(path: string, options: Omit<TestRequestOptions, 'method'> = {}): Promise<TestResponse> {
    return this.request(path, { ...options, method: 'PUT' });
  }

  patch(path: string, options: Omit<TestRequestOptions, 'method'> = {}): Promise<TestResponse> {
    return this.request(path, { ...options, method: 'PATCH' });
  }

  delete(path: string, options: Omit<TestRequestOptions, 'method'> = {}): Promise<TestResponse> {
    return this.request(path, { ...options, method: 'DELETE' });
  }
}

export function createTestClient(app?: Elysia): TestClient {
  return new TestClient(app);
}
