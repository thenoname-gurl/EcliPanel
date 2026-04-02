import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity()
export class DeletedUserRetention {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column()
  userId: number;

  @Index()
  @Column({ nullable: true })
  deletionRequestId?: number;

  @Column()
  firstName: string;

  @Column({ nullable: true })
  middleName?: string;

  @Column()
  lastName: string;

  @Column()
  email: string;

  @Column({ default: false })
  hasBillingHistory: boolean;

  @Column('datetime')
  deletedAt: Date;

  @Index()
  @Column('datetime')
  retainUntil: Date;

  @CreateDateColumn()
  createdAt: Date;
}