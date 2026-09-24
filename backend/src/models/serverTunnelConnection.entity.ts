import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index, Unique } from 'typeorm';

@Entity()
@Index(['srcServer', 'dstServer'], { unique: true })
export class ServerTunnelConnection {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  srcServer: string;

  @Column()
  dstServer: string;

  @Index()
  @Column({ nullable: true })
  dstName?: string;

  @Index()
  @Column({ default: 'active' })
  status: 'active' | 'pending';

  @CreateDateColumn()
  createdAt: Date;
}