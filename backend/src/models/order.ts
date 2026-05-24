import { Order as OrderEntity } from './order.entity';

export { Order } from './order.entity';
export type { Order as OrderEntity } from './order.entity';

export type OrderStatus = 'pending' | 'paid' | 'cancelled' | string;

export type OrderSummary = Pick<
  OrderEntity,
  'id' | 'userId' | 'orgId' | 'items' | 'amount' | 'status' | 'createdAt' | 'expiresAt'
>;
