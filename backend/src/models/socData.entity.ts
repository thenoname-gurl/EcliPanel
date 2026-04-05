import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity()
@Index('IDX_soc_data_server_timestamp', ['serverId', 'timestamp'])
export class SocData {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column()
  serverId: string;

  @Column('json')
  metrics: Record<string, any>;

  @Index()
  @Column('datetime')
  timestamp: Date;
}
