import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn } from 'typeorm';

export type FindingCategory =
  | 'login_anomaly'
  | 'server_posture'
  | 'access_control'
  | 'resource_anomaly'
  | 'node_security'
  | 'image_security'
  | 'intrusion_detection'
  | 'malware'
  | 'policy_violation'
  | 'configuration'
  | 'other';

export type FindingSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export type FindingStatus = 'open' | 'acknowledged' | 'resolved' | 'false_positive';

export type FindingSource = 'internal' | 'external';

@Entity()
@Index(['category', 'severity'])
@Index(['status'])
@Index(['source'])
@Index(['detectedAt'])
@Index(['serverId'])
@Index(['nodeId'])
@Index(['userId'])
export class SecurityFinding {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 20, default: 'internal' })
  source: FindingSource;

  @Column({ nullable: true, type: 'varchar', length: 128 })
  sourceName?: string;

  @Column({ type: 'varchar', length: 50 })
  category: FindingCategory;

  @Column({ type: 'varchar', length: 20 })
  severity: FindingSeverity;

  @Column({ type: 'text' })
  title: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ nullable: true, type: 'varchar', length: 36 })
  serverId?: string;

  @Column({ nullable: true })
  nodeId?: number;

  @Column({ nullable: true })
  userId?: number;

  @Column('json', { nullable: true })
  metadata?: Record<string, any>;

  @Column({ default: 'open', type: 'varchar', length: 20 })
  status: FindingStatus;

  @Column({ nullable: true, type: 'varchar', length: 255 })
  @Index()
  checkFingerprint?: string;

  @CreateDateColumn()
  detectedAt: Date;

  @Column({ nullable: true })
  resolvedAt?: Date;

  @Column({ nullable: true })
  resolvedByUserId?: number;
}