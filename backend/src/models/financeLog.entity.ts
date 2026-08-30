import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity()
export class FinanceLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column({ nullable: true })
  orderId?: number;

  @Column('float')
  amount: number;

  @Column({ default: 'USD' })
  currency: string;

  @Column()
  nature: string;

  @Column()
  name: string;

  @Column({ nullable: true, type: 'text' })
  notes?: string;

  @Column({ nullable: true, type: 'text' })
  invoicePath?: string;

  @Column({ nullable: true, type: 'text' })
  error?: string;

  @Column()
  externalId: string;

  @Column({ nullable: true })
  sureTransactionId?: string;

  @Column({ default: 'sent' })
  status: string;

  @Index()
  @Column('datetime')
  createdAt: Date;
}
