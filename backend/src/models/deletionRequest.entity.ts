import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class DeletionRequest {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @Column()
  status: string;

  @Column('datetime')
  requestedAt: Date;

  @Column({ nullable: true, type: 'datetime' })
  approvedAt?: Date;

  @Column({ nullable: true, type: 'datetime' })
  scheduledDeletionAt?: Date;

  @Column({ nullable: true, type: 'datetime' })
  deletedAt?: Date;

  @Column({ nullable: true })
  approvedBy?: number;

  @Column({ default: false })
  idVerified: boolean;
}
