import { Entity, PrimaryColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity({ name: 'server_schedule_steps' })
export class ServerScheduleStep {
  @PrimaryColumn()
  uuid: string;

  @Index()
  @Column()
  scheduleUuid: string;

  @Column({ name: 'order_' })
  order_: number;

  @Column('json')
  action: any;

  @CreateDateColumn()
  created: Date;
}