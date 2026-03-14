import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { User } from './user.entity';

@Entity()
export class Organisation {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ unique: true })
  handle: string;

  @Column()
  ownerId: number;

  @Column({ default: 'free' })
  portalTier: string;

  @Column({ nullable: true })
  avatarUrl?: string;

  @OneToMany(() => User, (user) => user.org)
  users: User[];

  @OneToMany(() => require('./organisationInvite.entity').OrganisationInvite, (inv: any) => inv.organisation)
  invites: import('./organisationInvite.entity').OrganisationInvite[];
}
