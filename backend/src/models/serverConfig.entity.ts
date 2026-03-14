import { Entity, PrimaryColumn, Column, CreateDateColumn } from 'typeorm';


@Entity()
export class ServerConfig {
  @PrimaryColumn()
  uuid: string;

  @Column()
  nodeId: number;

  @Column()
  userId: number;

  @Column({ nullable: true })
  name?: string;

  @Column({ nullable: true, type: 'text' })
  description?: string;

  @Column({ default: false })
  suspended: boolean;

  @Column({ default: false })
  hibernated: boolean;

  @Column('json', { nullable: true })
  environment?: Record<string, string>;

  @Column({ nullable: true, type: 'text' })
  dockerImage?: string;

  @Column({ nullable: true, type: 'text' })
  startup?: string;

  @Column({ default: 1024 })
  memory: number;

  @Column({ default: 10240 })
  disk: number;

  @Column({ default: 100 })
  cpu: number;

  @Column({ default: 0 })
  swap: number;

  @Column({ default: 500 })
  ioWeight: number;

  @Column({ default: false })
  oomDisabled: boolean;

  @Column({ nullable: true })
  eggId?: number;

  @Column({ default: false })
  skipEggScripts: boolean;

  @Column('json', { nullable: true })
  allocations?: Record<string, any>;

  @Column('json', { nullable: true })
  schedules?: Record<string, any>[];

  @Column('json', { nullable: true })
  processConfig?: Record<string, any>;

  @Column({ default: 0 })
  maxDatabases: number;

  @Column({ default: 0 })
  maxBackups: number;

  @CreateDateColumn()
  createdAt: Date;
}
