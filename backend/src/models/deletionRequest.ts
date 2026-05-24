export { DeletionRequest } from './deletionRequest.entity';
export type { DeletionRequest as DeletionRequestEntity } from './deletionRequest.entity';

export type DeletionRequestStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'pending_deletion'
  | 'cancelled'
  | string;
