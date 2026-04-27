import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import type { User } from './user.entity';

@Entity()
export class ShortUrl {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  code: string;

  @Column({ default: 'root' })
  prefix: 'root' | 'a';

  @Column()
  targetUrl: string;

  @Column({ default: true })
  active: boolean;

  @Column({ nullable: true })
  ownerId?: number;

  @ManyToOne(() => require('./user.entity').User, (user: any) => user.id, { nullable: true, onDelete: 'SET NULL' })
  owner?: User;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime' })
  updatedAt: Date;
}