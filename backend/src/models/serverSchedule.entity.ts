import { Entity, PrimaryColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity({ name: 'server_schedules' })
export class ServerSchedule {
  @PrimaryColumn()
  uuid: string;

  @Index()
  @Column()
  serverUuid: string;

  @Column({ length: 255 })
  name: string;

  @Column({ default: true })
  enabled: boolean;

  @Column('json')
  triggers: any[];

  @Column('json')
  condition: any;

  @Column({ nullable: true, type: 'datetime' })
  lastRun?: Date | null;

  @Column({ nullable: true, type: 'datetime' })
  lastFailure?: Date | null;

  @CreateDateColumn()
  created: Date;
}