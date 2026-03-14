import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class Order {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @Column({ nullable: true })
  orgId?: number;

  @Column('text')
  items: string;

  @Column('float', { default: 0 })
  amount: number;

  @Column()
  status: string;

  @Column({ nullable: true, type: 'text' })
  description?: string;

  @Column({ nullable: true })
  planId?: number;

  @Column({ nullable: true, type: 'text' })
  notes?: string;

  @Column('datetime')
  createdAt: Date;

  @Column('datetime')
  expiresAt: Date;
}
