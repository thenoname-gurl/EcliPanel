import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class SocData {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  serverId: string;

  @Column('json')
  metrics: Record<string, any>;

  @Column('datetime')
  timestamp: Date;
}
