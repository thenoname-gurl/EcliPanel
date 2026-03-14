export interface Order {
  id: number;
  userId: number;
  items: string;
  amount: number;
  status: 'pending' | 'paid' | 'cancelled';
  createdAt: Date;
  expiresAt: Date;
}