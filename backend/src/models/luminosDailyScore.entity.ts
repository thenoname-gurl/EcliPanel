import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn } from 'typeorm';

@Entity()
@Index(['userId', 'day'], { unique: true })
export class LuminosDailyScore {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @Column({ length: 10 })
  day: string;

  @Column('int', { default: 0 })
  score: number;

  @Column('int', { default: 0 })
  correct: number;

  @Column('int', { default: 0 })
  total: number;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;
}
