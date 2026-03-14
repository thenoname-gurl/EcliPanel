export interface DeletionRequest {
  id: number;
  userId: number;
  status: 'pending' | 'approved' | 'rejected';
  requestedAt: Date;
  approvedBy?: number;
  idVerified?: boolean;
}