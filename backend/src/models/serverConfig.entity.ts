import { Entity, PrimaryColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity()
@Index(['nodeId', 'desiredPowerState', 'suspended', 'dmca', 'hibernated'])
export class ServerConfig {
  @PrimaryColumn()
  uuid: string;

  @Index()
  @Column()
  nodeId: number;

  @Index()
  @Column({ nullable: true })
  destinationNodeId?: number;

  @Index()
  @Column()
  userId: number;

  @Column({ nullable: true })
  name?: string;

  @Column({ nullable: true, type: 'text' })
  description?: string;

  @Index()
  @Column({ default: false })
  suspended: boolean;

  @Column({ nullable: true, type: 'text' })
  suspendedBy?: string;

  @Column({ nullable: true, type: 'text' })
  suspendedReason?: string;

  @Column({ nullable: true, type: 'datetime' })
  suspendedAt?: Date;

  @Index()
  @Column({ default: false })
  dmca: boolean;

  @Column({ default: false })
  ignoreAntiAbuse: boolean;

  @Column({ nullable: true, type: 'text' })
  dmcaBy?: string;

  @Column({ nullable: true, type: 'text' })
  dmcaReason?: string;

  @Column({ nullable: true, type: 'datetime' })
  dmcaAt?: Date;

  @Column({ nullable: true, type: 'datetime' })
  dmcaDeletionAt?: Date;

  @Index()
  @Column({ default: false })
  hibernated: boolean;

  @Index()
  @Column({ default: false })
  desiredPowerState: boolean;

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

  @Column({ default: false })
  kvmPassthroughEnabled: boolean;

  @Column({ nullable: true, type: 'varchar', length: 16, default: 'lxc' })
  vmType?: 'lxc' | 'qemu';

  @Column({ nullable: true, type: 'int' })
  vmid?: number;

  @Column({ nullable: true, type: 'text' })
  template?: string;

  @Column({ nullable: true, type: 'text' })
  isoFile?: string;

  @Column({ nullable: true, type: 'int' })
  cores?: number;

  @Column({ nullable: true, type: 'int' })
  sockets?: number;

  @Column({ nullable: true, type: 'text' })
  ostemplate?: string;

  @Column({ nullable: true, type: 'text' })
  rootfs?: string;

  @Column({ nullable: true, type: 'text' })
  netif?: string;

  @Column({ nullable: true, type: 'text' })
  nameserver?: string;

  @Column({ nullable: true, type: 'text' })
  searchdomain?: string;

  @Column({ nullable: true })
  eggId?: number;

  @Column({ default: false })
  skipEggScripts: boolean;

  @Column({ default: true })
  autoSyncOnEggChange: boolean;

  @Column({ default: false })
  installing: boolean;

  @Column('json', { nullable: true })
  allocations?: Record<string, any>;

  @Column('json', { nullable: true })
  schedules?: Record<string, any>[];

  @Column('json', { nullable: true })
  processConfig?: Record<string, any>;

  @Index()
  @Column({ nullable: true, type: 'datetime' })
  lastActivityAt?: Date;

  @Column({ default: 0 })
  maxDatabases: number;

  @Column({ default: 0 })
  maxBackups: number;

  @CreateDateColumn()
  createdAt: Date;
}
