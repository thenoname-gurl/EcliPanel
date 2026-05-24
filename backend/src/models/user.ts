import { User as UserEntity } from './user.entity';

export { User } from './user.entity';
export type { User as UserEntity } from './user.entity';

export type UserRole = 'admin' | 'free' | 'paid' | 'enterprise' | 'subuser';
export type PortalType = 'free' | 'paid' | 'enterprise';

export type UserSummary = Pick<
  UserEntity,
  | 'id'
  | 'email'
  | 'firstName'
  | 'lastName'
  | 'displayName'
  | 'role'
  | 'portalType'
  | 'emailVerified'
  | 'idVerified'
  | 'suspended'
  | 'avatarUrl'
>;
