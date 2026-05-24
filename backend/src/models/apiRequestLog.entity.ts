import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity({ name: 'api_request_log' })
@Index('idx_timestamp', ['timestamp'])
@Index('idx_endpoint', ['endpoint'])
@Index('idx_timestamp_user', ['timestamp', 'userId'])
@Index('idx_timestamp_org', ['timestamp', 'organisationId'])
export class ApiRequestLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: true })
  userId?: number;

  @Column({ nullable: true })
  organisationId?: number;

  @Column()
  endpoint: string;

  @Column('int')
  count: number;

  @Column({ type: 'timestamp' })
  timestamp: Date;
}
