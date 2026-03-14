import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn } from 'typeorm';
import { User } from './user.entity';

export const OAUTH_SCOPES = [
  'profile',       // name, displayName, avatarUrl, portalType
  'email',         // email + emailVerified
  'servers:read',  // list user servers
  'servers:write', // manage servers
  'orgs:read',     // org membership info
  'billing:read',  // billing/plan info
  'admin',         // admin-level access (only granted to admins)
] as const;

export type OAuthScope = typeof OAUTH_SCOPES[number];

@Entity()
export class OAuthApp {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  clientId: string;

  @Column()
  clientSecretHash: string;

  @Column()
  name: string;

  @Column('text', { nullable: true })
  description?: string;

  @Column({ nullable: true })
  logoUrl?: string;

  @Column('simple-json')
  redirectUris: string[];

  @Column('simple-json')
  allowedScopes: string[];

  @Column('simple-json')
  grantTypes: string[];

  @ManyToOne(() => User, { nullable: true, eager: false, onDelete: 'SET NULL' })
  owner?: User;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ default: true })
  active: boolean;
}
