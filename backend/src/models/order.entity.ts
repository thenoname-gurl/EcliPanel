import { Index, Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class Order {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  @Index()
  userId: number;

  @Column({ nullable: true })
  orgId?: number;

  @Column('text')
  items: string;

  @Column('float', { default: 0 })
  amount: number;

  @Column('float', { default: 0 })
  taxAmount: number;

  @Column('float', { default: 0 })
  taxRate: number;

  @Column()
  @Index()
  status: string;

  @Column({ nullable: true, type: 'text' })
  description?: string;

  @Column({ nullable: true })
  planId?: number;

  @Column({ nullable: true, type: 'text' })
  notes?: string;

  @Column({ nullable: true })
  paymentMethod?: string;

  @Column({ nullable: true })
  paymentTxId?: string;

  @Column({ nullable: true })
  paymentProvider?: string;

  @Column({ nullable: true })
  cryptoAddress?: string;

  @Column('float', { nullable: true })
  cryptoAmount?: number;

  @Column({ nullable: true })
  cryptoCurrency?: string;

  @Column({ nullable: true })
  cryptoNetwork?: string;

  @Column({ nullable: true })
  couponId?: number;

  @Column({ nullable: true, type: 'text' })
  couponCode?: string;

  @Column('float', { default: 0 })
  discountAmount: number;

  @Column('datetime')
  createdAt: Date;

  @Index()
  @Column('datetime')
  expiresAt: Date;

  @Column({ nullable: true })
  billingType?: string;

  @Column({ nullable: true, type: 'datetime' })
  lifetimeBlockedAt?: Date;

  @Column({ nullable: true, type: 'datetime' })
  lifetimeGraceEndsAt?: Date;
}
