import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index, UpdateDateColumn } from 'typeorm';

export type TunnelProtocol = 'tcp' | 'udp';

@Entity()
@Index(['serverUuid', 'port'], { unique: true })
export class ServerTunnelPort {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  serverUuid: string;

  @Column({ type: 'int' })
  port: number;

  @Column('json')
  protocols: TunnelProtocol[];

  @Index()
  @CreateDateColumn()
  createdAt: Date;
}