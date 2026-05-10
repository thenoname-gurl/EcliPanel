import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export interface GithubCommitSummary {
  sha: string;
  message: string;
  url: string;
  committedAt: string;
}

@Index(['repoOwner', 'repoName', 'login'], { unique: true })
@Entity()
export class GithubContributor {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'text' })
  repoOwner: string;

  @Column({ type: 'text' })
  repoName: string;

  @Column({ type: 'text' })
  login: string;

  @Column({ type: 'text' })
  avatarUrl: string;

  @Column({ type: 'text' })
  profileUrl: string;

  @Column({ type: 'int', default: 0 })
  contributions: number;

  @Column({ type: 'boolean', default: false })
  isBot: boolean;

  @Column({ type: 'datetime', nullable: true })
  lastCommitAt?: Date;

  @Column({ type: 'simple-json' })
  recentCommits: GithubCommitSummary[];

  @Column({ type: 'datetime' })
  fetchedAt: Date;
}