import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity()
@Index(['nodeId', 'timestamp'])
export class NodeHeartbeat {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  nodeId: number;

  @Column({ nullable: true, type: 'int' })
  responseMs?: number;

  /* 'ok' | 'timeout' | 'error' */
  @Column({ default: 'ok' })
  status: string;

  @CreateDateColumn()
  timestamp: Date;
}
