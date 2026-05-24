import { Organisation as OrgEntity } from './organisation.entity';

export { Organisation } from './organisation.entity';
export type { Organisation as OrganisationEntity } from './organisation.entity';

export type OrganisationSummary = Pick<
  OrgEntity,
  'id' | 'name' | 'handle' | 'ownerId' | 'portalTier' | 'avatarUrl'
>;
