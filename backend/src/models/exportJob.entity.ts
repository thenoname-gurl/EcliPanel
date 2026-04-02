import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity()
export class ExportJob {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ nullable: true })
  userId?: number;

  @Index()
  @Column({ nullable: true })
  adminId?: number;

  @Column({ default: 'queued' })
  status: string;

  @Column({ default: 0 })
  progress: number;

  @Column({ nullable: true, type: 'text' })
  message?: string;

  @Column({ nullable: true, type: 'text' })
  resultPath?: string;

  @Index({ unique: true })
  @Column({ nullable: true, type: 'varchar', length: 191 })
  shareToken?: string;

  @Column({ nullable: true, type: 'datetime' })
  shareLinkExpiresAt?: Date;

  @Column({ default: 0 })
  shareDownloadsRemaining: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
