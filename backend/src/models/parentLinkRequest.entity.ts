import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { User } from './user.entity';

@Entity()
@Index(['parentId', 'childId', 'status'])
export class ParentLinkRequest {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'childId' })
  child: User;

  @Column()
  childId: number;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'parentId' })
  parent: User;

  @Column()
  parentId: number;

  @Column({ nullable: true })
  parentEmail?: string;

  @Column({ length: 16 })
  code: string;

  @Column({ default: 'pending' })
  status: 'pending' | 'accepted' | 'rejected';

  @Column('datetime')
  createdAt: Date;

  @Column('datetime')
  updatedAt: Date;

  @Column({ nullable: true, type: 'datetime' })
  acceptedAt?: Date;
}