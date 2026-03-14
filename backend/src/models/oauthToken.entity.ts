import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn } from 'typeorm';
import { OAuthApp } from './oauthApp.entity';
import { User } from './user.entity';

@Entity()
export class OAuthToken {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  accessToken: string;

  @Column({ unique: true, nullable: true })
  refreshToken?: string;

  @ManyToOne(() => OAuthApp, { eager: true, onDelete: 'CASCADE' })
  app: OAuthApp;

  @ManyToOne(() => User, { nullable: true, eager: true, onDelete: 'CASCADE' })
  user?: User;

  @Column('simple-json')
  scopes: string[];

  @Column('datetime')
  accessTokenExpiresAt: Date;

  @Column('datetime', { nullable: true })
  refreshTokenExpiresAt?: Date;

  @Column({ default: false })
  revoked: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
