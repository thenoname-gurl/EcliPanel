export interface User {
  id: number;
  name: string;
  email: string;
  passwordHash: string;
  role: 'admin' | 'free' | 'paid' | 'enterprise' | 'subuser';
  portalType: 'free' | 'paid' | 'enterprise';
  orgId?: number;
  limits?: Record<string, any>;
  idVerified?: boolean;
  deletionRequested?: boolean;
  deletionApproved?: boolean;
}