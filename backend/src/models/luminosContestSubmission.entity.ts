import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn } from 'typeorm';

@Entity()
@Index(['contestId', 'userId'], { unique: true })
export class LuminosContestSubmission {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column()
  contestId: number;

  @Column()
  userId: number;

  @Column('text')
  content: string;

  @Column({ nullable: true, type: 'text' })
  imageUrl?: string;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;
}
