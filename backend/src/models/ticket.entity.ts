import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity()
export class Ticket {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @Column()
  subject: string;

  @Column({ type: 'text' })
  message: string;

  @Column({ default: 'opened' })
  status: string;

  @Column({ default: 'medium' })
  priority: string;

  @Column({ nullable: true })
  assignedTo: number | null;

  @Column({ nullable: true })
  department: string | null;

  @Column({ type: 'text', nullable: true, charset: 'utf8mb4', collation: 'utf8mb4_unicode_ci' })
  adminReply: string | null;

  @Column({ default: false })
  aiTouched: boolean;

  @Column({ default: false })
  aiMarkedSpam: boolean;

  @Column({ default: false })
  aiClosed: boolean;

  @Column({ default: false })
  aiDisabled: boolean;

  @Column({ default: false })
  archived: boolean;

  @Column({ type: 'simple-json', nullable: true, charset: 'utf8mb4', collation: 'utf8mb4_unicode_ci' })
  messages?: Array<{
    sender: 'user' | 'staff' | 'system';
    message: string;
    created: Date;
    ai?: boolean;
    staffId?: number;
    staffName?: string;
    staffDisplayName?: string;
    staffLegalName?: string;
    staffAvatar?: string;
    userAvatar?: string;
    avatarUrl?: string;
  }>;

  @CreateDateColumn()
  created: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
