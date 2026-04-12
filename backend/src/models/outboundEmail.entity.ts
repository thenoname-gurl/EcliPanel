import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { User } from './user.entity';

@Entity()
export class OutboundEmail {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @ManyToOne(() => User, { nullable: false })
  user: User;

  @Column({ nullable: true })
  fromAddress?: string;

  @Column()
  toAddress: string;
  
  @Column({ nullable: true, type: 'text' })
  cc?: string;

  @Column({ nullable: true, type: 'text' })
  bcc?: string;

  @Column({ nullable: true })
  subject?: string;

  @Column('text')
  body: string;

  @Column({ nullable: true, type: 'text' })
  html?: string;

  @Column({ default: 'queued' })
  status: 'queued' | 'sent' | 'failed';

  @Column({ default: false })
  favorite: boolean;

  @Column({ type: 'datetime', nullable: true })
  scheduledAt?: Date;

  @Column({ type: 'datetime', nullable: true })
  sentAt?: Date;

  @Column({ default: 0 })
  attempts: number;

  @Column({ nullable: true, type: 'text' })
  failureReason?: string;

  @Column({ nullable: true })
  messageId?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}