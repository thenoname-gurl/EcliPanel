import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn } from 'typeorm';

@Entity()
@Index(['adminUserId', 'timestamp'])
@Index(['action', 'timestamp'])
@Index(['sessionId', 'timestamp'])
export class AdminAuditEntry {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  @Index()
  adminUserId: number;

  @Column({ type: 'varchar', length: 255 })
  @Index()
  action: string;

  @Column({ nullable: true, type: 'varchar', length: 255 })
  targetId?: string;

  @Column({ nullable: true, type: 'varchar', length: 128 })
  targetType?: string;

  @Column('json', { nullable: true })
  metadata?: Record<string, any>;

  @Column({ nullable: true, type: 'varchar', length: 64 })
  sessionId?: string;

  @Column({ nullable: true, type: 'int', default: 0 })
  durationMs?: number;

  @Column({ nullable: true, type: 'text' })
  ipAddress?: string;

  @CreateDateColumn()
  @Index()
  timestamp: Date;
}