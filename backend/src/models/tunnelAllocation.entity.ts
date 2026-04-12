import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { TunnelDevice } from './tunnelDevice.entity';

@Entity()
export class TunnelAllocation {
  @PrimaryGeneratedColumn()
  id: number;

  @Index({ unique: true })
  @Column()
  port: number;

  @Column({ length: 16, default: 'tcp' })
  protocol: string;

  @Column({ length: 128 })
  host: string;

  @ManyToOne(() => TunnelDevice, { eager: true })
  clientDevice: TunnelDevice;

  @ManyToOne(() => TunnelDevice, { eager: true, nullable: true })
  serverDevice?: TunnelDevice;

  @Column({ length: 128, default: '0.0.0.0' })
  localHost: string;

  @Column()
  localPort: number;

  @Column({ length: 32, default: 'pending' })
  status: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}