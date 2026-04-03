import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, Index, JoinColumn } from 'typeorm';

@Entity()
@Index('IDX_9cc288407803dda762f27cb481', ['userId', 'organisationId'], { unique: true })
export class OrganisationMember {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: true })
  userId: number;

  @Column({ nullable: true })
  organisationId: number;

  @ManyToOne(() => require('./user.entity').User, (user: any) => user.organisationMemberships, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: import('./user.entity').User;

  @ManyToOne(() => require('./organisation.entity').Organisation, (org: any) => org.memberships, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organisationId' })
  organisation: import('./organisation.entity').Organisation;

  @Column({ name: 'role', default: 'member' })
  orgRole: 'member' | 'admin' | 'owner';

  @Column('datetime', { precision: 6, default: () => 'CURRENT_TIMESTAMP(6)' })
  createdAt: Date;
}