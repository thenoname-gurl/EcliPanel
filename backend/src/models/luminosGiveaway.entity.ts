import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn } from 'typeorm';

@Entity()
export class LuminosGiveaway {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  title: string;

  @Column('text', { nullable: true })
  description?: string;

  @Column('text', { nullable: true })
  prize?: string;

  @Index()
  @Column('datetime')
  startsAt: Date;

  @Index()
  @Column('datetime')
  endsAt: Date;

  @Column({ default: false })
  isArchived: boolean;

  @Column({ nullable: true })
  winnerId?: number;

  @Column()
  createdById: number;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;
}
