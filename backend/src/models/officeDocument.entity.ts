import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export type OfficeDocType = 'document' | 'spreadsheet' | 'presentation' | 'notebook';

@Entity()
export class OfficeDocument {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column()
  userId: number;

  @Index()
  @Column({ nullable: true })
  orgId: number | null;

  @Column({ type: 'varchar', length: 32, default: 'document' })
  type: OfficeDocType;

  @Column({ length: 255, charset: 'utf8mb4', collation: 'utf8mb4_unicode_ci' })
  name: string;

  @Column({ type: 'text', nullable: true, charset: 'utf8mb4', collation: 'utf8mb4_unicode_ci' })
  description: string | null;

  @Column({ type: 'longtext', nullable: true })
  content: string | null;

  @Column({ type: 'longtext', nullable: true })
  yjsState: string | null;

  @Column({ type: 'longtext', nullable: true })
  awarenessState: string | null;

  @Column({ default: false })
  cloudStored: boolean;

  @Column({ nullable: true })
  thumbnailUrl: string | null;

  @Column({ default: false })
  isStarred: boolean;

  @Column({ length: 64, nullable: true })
  folder: string | null;

  @Column({ default: false })
  isTrashed: boolean;

  @Index(['userId', 'isTrashed'])
  @Column({ type: 'datetime', nullable: true })
  trashedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}