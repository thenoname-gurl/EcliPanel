export {
  createMockRepository,
  mockDataSource,
  clearAllMocks,
  setMockData,
  getMockRepository,
  type MockRepository,
} from './mock';

export {
  createTestUser,
  createTestOrganisation,
  createTestRole,
  createTestPermission,
  createTestAdminUser,
  createOrganisationMember,
  fixtures,
} from './fixtures';

export { TestClient, createTestClient, type TestRequestOptions, type TestResponse } from './testClient';

import { mockDataSource, clearAllMocks } from './mock';

export const originalEnv = { ...process.env };

export function setupTestEnv(): void {
  process.env = {
    ...originalEnv,
    JWT_SECRET: 'test-jwt-secret-for-testing-only-do-not-use-in-production',
    JWT_COOKIE_NAME: 'token',
    JWT_COOKIE_SECURE: '0',
    PANEL_URL: 'https://panel.test.local',
    FRONTEND_URL: 'https://panel.test.local',
    BACKEND_URL: 'https://api.test.local',
  };
}

export function resetTestEnv(): void {
  process.env = { ...originalEnv };
}

export function beforeEachTest(): void {
  setupTestEnv();
  clearAllMocks();
}

export function afterEachTest(): void {
  resetTestEnv();
}

export const mockAppDataSource = mockDataSource();
