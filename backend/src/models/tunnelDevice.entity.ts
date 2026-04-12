import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, Index } from 'typeorm';
import { Organisation } from './organisation.entity';
import { User } from './user.entity';

@Entity()
export class TunnelDevice {
  @PrimaryGeneratedColumn()
  id: number;

  @Index({ unique: true })
  @Column()
  deviceCode: string;

  @Column({ length: 32 })
  userCode: string;

  @Column({ nullable: true })
  name?: string;

  @Column({ length: 16, default: 'client' })
  kind: string;

  @Column({ default: false })
  approved: boolean;

  @Column({ nullable: true })
  token?: string;

  @ManyToOne(() => User, { nullable: true, eager: true })
  approvedBy?: User;

  @ManyToOne(() => User, { nullable: true, eager: true })
  ownerUser?: User;

  @ManyToOne(() => Organisation, { nullable: true, eager: true })
  organisation?: Organisation;

  @Column('datetime', { nullable: true })
  lastSeenAt?: Date;

  @Column('datetime')
  expiresAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}