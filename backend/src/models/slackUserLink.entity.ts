import { Entity, PrimaryGeneratedColumn, ManyToOne, Column, Index, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { User } from './user.entity';

@Entity()
export class SlackUserLink {
  @PrimaryGeneratedColumn()
  id: number;

  @Index({ unique: true })
  @Column()
  slackUserId: string;

  @Column({ nullable: true })
  slackWorkspaceId?: string;

  @ManyToOne(() => User, u => u.id, { onDelete: 'CASCADE' })
  user: User;

  @Column({ nullable: true })
  githubToken?: string;

  @Column({ nullable: true })
  githubLogin?: string;

  @Column('json', { nullable: true })
  mcpTools?: Array<{
    name: string;
    description: string;
    endpoint: string;
    apiKey?: string;
  }>;

  @Column('json', { nullable: true })
  aiConfig?: {
    provider?: string;
    endpoint?: string;
    apiKey?: string;
    modelId?: string;
  };

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime' })
  updatedAt: Date;
}