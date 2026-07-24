import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity()
export class EloProject {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column({ nullable: true })
  serverId: string | null;

  @Index()
  @Column()
  userId: number;

  @Column({ default: 1000 })
  eloScore: number;

  @Column({ default: 24 })
  kFactor: number;

  @Column({ default: 0 })
  totalVotes: number;

  @Column({ default: 0 })
  wins: number;

  @Column({ default: 0 })
  losses: number;

  @Column({ default: 5 })
  skipTokensRemaining: number;

  @Column({ default: 5 })
  maxSkipTokens: number;

  @Column({ nullable: true })
  title?: string;

  @Column({ nullable: true, type: 'text' })
  description?: string;

  @Column('json', { nullable: true })
  tags?: string[];

  @Column({ nullable: true, type: 'text' })
  readme?: string;

  @Column({ nullable: true })
  githubUrl?: string;

  @Column({ nullable: true })
  demoUrl?: string;

  @Column({ nullable: true, type: 'datetime' })
  orphanedAt?: Date;

  @Column('json', { nullable: true })
  screenshots?: string[];

  @Column({ default: false })
  isWellMade: boolean;

  @Column({ default: 'active' })
  moderationStatus: string;

  @Column({ nullable: true, type: 'text' })
  moderationNote?: string;

  @Column({ nullable: true, type: 'datetime' })
  disqualifiedAt?: Date;

  @Column({ nullable: true })
  disqualifiedBy?: number;

  @Column({ nullable: true, type: 'datetime' })
  lastActiveAt?: Date;

  @CreateDateColumn()
  createdAt: Date;
}
