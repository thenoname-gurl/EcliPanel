import { User } from '../../src/models/user.entity';
import { Organisation } from '../../src/models/organisation.entity';
import { Role } from '../../src/models/role.entity';
import { UserRole } from '../../src/models/userRole.entity';
import { Permission } from '../../src/models/permission.entity';
import { OrganisationMember } from '../../src/models/organisationMember.entity';

export function createTestUser(overrides: Partial<User> = {}): User {
  const now = new Date();
  return {
    id: 1,
    createdAt: now,
    firstName: 'Test',
    lastName: 'User',
    email: 'test@example.com',
    address: '123 Test St',
    passwordHash: '',
    orgRole: 'member',
    portalType: 'free',
    fraudFlag: false,
    emailVerified: false,
    studentVerified: false,
    idVerified: false,
    twoFactorEnabled: false,
    suspended: false,
    supportBanned: false,
    deletionRequested: false,
    deletionApproved: false,
    guideShown: false,
    sessions: [],
    userRoles: [],
    organisationMemberships: [],
    ...overrides,
  } as unknown as User;
}

export function createTestOrganisation(overrides: Partial<Organisation> = {}): Organisation {
  const now = new Date();
  return {
    id: 1,
    createdAt: now,
    name: 'Test Organisation',
    members: [],
    ...overrides,
  } as unknown as Organisation;
}

export function createTestRole(overrides: Partial<Role> = {}): Role {
  const now = new Date();
  return {
    id: 1,
    name: 'Test Role',
    permissions: [],
    userRoles: [],
    ...overrides,
  } as unknown as Role;
}

export function createTestPermission(value: string, overrides: Partial<Permission> = {}): Permission {
  const now = new Date();
  return {
    id: 1,
    value,
    ...overrides,
  } as unknown as Permission;
}

export function createTestAdminUser(overrides: Partial<User> = {}): User {
  const adminPerm = createTestPermission('admin:*');
  const adminRole = createTestRole({
    name: 'Admin',
    permissions: [adminPerm],
  });

  const user = createTestUser({
    id: 1,
    email: 'admin@example.com',
    ...overrides,
  });

  const userRole = {
    id: 1,
    userId: user.id,
    roleId: adminRole.id,
    role: adminRole,
  } as unknown as UserRole;

  user.userRoles = [userRole];
  return user;
}

export function createOrganisationMember(
  userId: number,
  organisationId: number,
  overrides: Partial<OrganisationMember> = {}
): OrganisationMember {
  return {
    id: 1,
    userId,
    organisationId,
    createdAt: new Date(),
    ...overrides,
  } as unknown as OrganisationMember;
}

export const fixtures = {
  users: {
    regular: createTestUser(),
    admin: createTestAdminUser(),
  },
  organisations: {
    default: createTestOrganisation(),
  },
};
