import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn } from 'typeorm';
import { OAuthApp } from './oauthApp.entity';
import { User } from './user.entity';

@Entity()
export class OAuthAuthCode {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  code: string;

  @ManyToOne(() => OAuthApp, { eager: true, onDelete: 'CASCADE' })
  app: OAuthApp;

  @ManyToOne(() => User, { eager: true, onDelete: 'CASCADE' })
  user: User;

  @Column()
  redirectUri: string;

  @Column('simple-json')
  scopes: string[];

  @Column({ nullable: true })
  codeChallenge?: string;

  @Column({ nullable: true })
  codeChallengeMethod?: string;

  @Column({ nullable: true })
  state?: string;

  @Column('datetime')
  expiresAt: Date;

  @Column({ default: false })
  used: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
