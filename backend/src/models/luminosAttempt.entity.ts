import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity()
export class LuminosAttempt {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column()
  userId: number;

  @Column('json')
  questionIds: number[];

  @Column('int', { default: 0 })
  score: number;

  @Column({ default: false })
  passed: boolean;

  @Column({ length: 16, default: 'in_progress' })
  status: string;

  @Column('datetime')
  startedAt: Date;

  @Column('datetime', { nullable: true })
  submittedAt?: Date;
}
