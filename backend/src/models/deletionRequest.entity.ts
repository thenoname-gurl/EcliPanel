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

  @Column({ nullable: true })
  approvedBy?: number;

  @Column({ default: false })
  idVerified: boolean;
}
