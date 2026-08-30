import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn } from 'typeorm';

@Entity()
export class LuminosContest {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  title: string;

  @Column('text', { nullable: true })
  description?: string;

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
