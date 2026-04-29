export interface DeletionRequest {
  id: number;
  userId: number;
  status: 'pending' | 'approved' | 'rejected' | 'pending_deletion' | 'cancelled';
  requestedAt: Date;
  approvedAt?: Date;
  scheduledDeletionAt?: Date;
  deletedAt?: Date;
  approvedBy?: number;
  idVerified?: boolean;
  autoSunset?: boolean;
}