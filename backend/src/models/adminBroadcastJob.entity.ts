import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { User } from './user.entity';

@Entity()
export class AdminBroadcastJob {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  adminId: number;

  @ManyToOne(() => User, { nullable: false })
  admin: User;

  @Column({ length: 255 })
  subject: string;

  @Column('text')
  message: string;

  @Column({ default: false })
  force: boolean;

  @Column({ default: 'queued' })
  status: 'queued' | 'running' | 'completed' | 'failed';

  @Column({ default: 0 })
  recipients: number;

  @Column({ nullable: true, type: 'text' })
  failureReason?: string;

  @Column({ type: 'datetime', nullable: true })
  startedAt?: Date;

  @Column({ type: 'datetime', nullable: true })
  completedAt?: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}