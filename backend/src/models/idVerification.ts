export interface IDVerification {
  id: number;
  userId: number;
  status: 'pending' | 'verified' | 'failed';
  provider: string;
  verifiedAt?: Date;
  idDocumentUrl?: string;
  selfieUrl?: string;
}