import { Entity, PrimaryGeneratedColumn, Column, OneToMany, ManyToOne } from 'typeorm';
import { ServerMapping } from './serverMapping.entity';
import { Organisation } from './organisation.entity';

export type NodeType = 'free' | 'paid' | 'free_and_paid' | 'enterprise';

@Entity()
export class Node {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true, nullable: true, type: 'varchar', length: 64 })
  nodeId?: string;

  @Column({ unique: true })
  name: string;

  @Column()
  url: string;

  @Column()
  token: string;

  @Column({ default: 'free', type: 'varchar' })
  nodeType: NodeType;

  @ManyToOne(() => Organisation, (o) => o.id, { nullable: true, eager: false })
  organisation?: Organisation; 

  @Column({ nullable: true, type: 'text' })
  rootUser?: string;

  @Column({ nullable: true, type: 'text' })
  rootPassword?: string;

  @OneToMany(() => ServerMapping, (m) => m.node)
  mappings: ServerMapping[];

  @Column({ nullable: true })
  portRangeStart?: number;

  @Column({ nullable: true })
  portRangeEnd?: number;

  @Column({ nullable: true, type: 'text' })
  defaultIp?: string;

  @Column({ nullable: true, type: 'text' })
  fqdn?: string;

  @Column('float', { nullable: true, default: 0 })
  cost?: number;

  @Column({ nullable: true })
  memory?: number;

  @Column({ nullable: true })
  disk?: number;

  @Column({ nullable: true })
  cpu?: number;

  @Column({ nullable: true })
  serverLimit?: number;

  @Column({ default: true })
  useSSL: boolean;

  @Column({ nullable: true, type: 'text' })
  allowedOrigin?: string;

  @Column({ nullable: true, default: 2022 })
  sftpPort?: number;

  @Column({ nullable: true })
  sftpProxyPort?: number;
}