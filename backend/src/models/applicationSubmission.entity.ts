import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export type ApplicationSubmissionStatus = 'pending' | 'accepted' | 'rejected' | 'archived';

@Entity()
export class ApplicationSubmission {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  formId: number;

  @Column({ nullable: true })
  userId?: number | null;

  @Column({ type: 'text', nullable: true })
  ipAddress?: string | null;

  @Column({ type: 'varchar', length: 24, default: 'pending' })
  status: ApplicationSubmissionStatus;

  @Column({ type: 'text', charset: 'utf8mb4', collation: 'utf8mb4_unicode_ci' })
  content: string;

  @Column({ type: 'simple-json', nullable: true, charset: 'utf8mb4', collation: 'utf8mb4_unicode_ci' })
  meta?: Record<string, any>;

  @Column({ nullable: true })
  reviewedBy?: number | null;

  @Column({ nullable: true, type: 'datetime' })
  reviewedAt?: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
