import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export interface GithubCommitSummary {
  sha: string;
  message: string;
  url: string;
  committedAt: string;
}

export interface GithubPullRequestSummary {
  number: number;
  title: string;
  url: string;
  state: string;
  createdAt: string;
  mergedAt?: string;
  merged: boolean;
}

export interface GithubCommitHistoryPoint {
  date: string;
  count: number;
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

  @Column({ type: 'int', default: 0 })
  pullRequests: number;

  @Column({ type: 'int', default: 0 })
  mergedPullRequests: number;

  @Column({ type: 'boolean', default: false })
  isBot: boolean;

  @Column({ type: 'datetime', nullable: true })
  lastCommitAt?: Date;

  @Column({ type: 'simple-json' })
  recentCommits: GithubCommitSummary[];

  @Column({ type: 'simple-json' })
  recentPullRequests: GithubPullRequestSummary[];

  @Column({ type: 'simple-json' })
  commitHistory: GithubCommitHistoryPoint[];

  @Column({ type: 'datetime' })
  fetchedAt: Date;
}