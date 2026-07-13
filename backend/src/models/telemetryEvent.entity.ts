import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity({ name: 'telemetry_event' })
@Index('idx_te_timestamp', ['timestamp'])
@Index('idx_te_user', ['userId'])
@Index('idx_te_event', ['event'])
@Index('idx_te_path', ['path'])
@Index('idx_te_user_ts', ['userId', 'timestamp'])
export class TelemetryEvent {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: true })
  userId?: number;

  @Column({ nullable: true })
  sessionId?: string;

  @Column()
  event: string;

  @Column({ nullable: true })
  category?: string;

  @Column({ nullable: true })
  label?: string;

  @Column({ nullable: true })
  path?: string;

  @Column({ type: 'simple-json', nullable: true })
  metadata?: Record<string, unknown>;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  timestamp: Date;
}