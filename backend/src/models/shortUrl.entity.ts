import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, UpdateDateColumn, Index, JoinColumn } from 'typeorm';
import { User } from './user.entity';

@Entity()
@Index(['code', 'prefix'], { unique: true })
export class ShortUrl {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 255 })
  code: string;

  @Column({ type: 'varchar', length: 10, default: 'a' })
  prefix: 'a' | 'root';

  @Column('text')
  target: string;

  @Column({ default: true })
  active: boolean;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'ownerId' })
  owner?: User;

  @Column({ nullable: true })
  ownerId?: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}