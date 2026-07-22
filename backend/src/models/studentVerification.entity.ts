import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity()
export class StudentVerification {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @Column({ default: 'pending' })
  status: string;

  @Column({ default: 'manual' })
  provider: string;

  @Column('text', { nullable: true })
  proofUrl?: string;

  @Column('text', { nullable: true })
  proofType?: string;

  @Column('text', { nullable: true })
  adminNotes?: string;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;

  @Column('datetime', { nullable: true })
  verifiedAt?: Date;
}