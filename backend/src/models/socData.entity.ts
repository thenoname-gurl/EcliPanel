import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity()
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
