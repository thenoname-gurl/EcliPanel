import { Index, Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class CouponUse {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  @Index()
  couponId: number;

  @Column()
  @Index()
  userId: number;

  @Column('datetime')
  usedAt: Date;
}
