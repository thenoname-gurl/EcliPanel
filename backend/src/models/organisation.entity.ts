import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';

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

  @Column({ default: false })
  isStaff: boolean;

  @Column({ nullable: true })
  avatarUrl?: string;

  @OneToMany(() => require('./organisationInvite.entity').OrganisationInvite, (inv: any) => inv.organisation)
  invites: import('./organisationInvite.entity').OrganisationInvite[];

  @OneToMany(() => require('./organisationMember.entity').OrganisationMember, (membership: any) => membership.organisation)
  memberships: import('./organisationMember.entity').OrganisationMember[];
}
