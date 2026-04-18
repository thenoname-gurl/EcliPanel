import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { User } from './user.entity';

@Entity()
@Index(['parentId', 'token'])
export class ParentRegistrationInvite {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'parentId' })
  parent: User;

  @Column()
  parentId: number;

  @Column({ nullable: true })
  childEmail?: string;

  @Column({ length: 36 })
  token: string;

  @Column({ default: false })
  used: boolean;

  @Column('datetime')
  createdAt: Date;

  @Column('datetime')
  updatedAt: Date;

  @Column({ nullable: true, type: 'datetime' })
  usedAt?: Date;

  @Column({ nullable: true, type: 'datetime' })
  expiresAt?: Date;
}