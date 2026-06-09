import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class Coupon {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  code: string;

  @Column()
  discountType: string;

  @Column('float')
  discountValue: number;

  @Column('float', { nullable: true })
  minOrderAmount?: number;

  @Column('float', { nullable: true })
  maxDiscountAmount?: number;

  @Column({ nullable: true })
  maxUsesTotal?: number;

  @Column({ nullable: true })
  maxUsesPerUser?: number;

  @Column({ default: 0 })
  currentUsesTotal: number;

  @Column('datetime', { nullable: true })
  expiresAt?: Date;

  @Column({ default: true })
  isActive: boolean;

  @Column({ nullable: true })
  createdBy?: number;

  @Column('datetime')
  createdAt: Date;
}
