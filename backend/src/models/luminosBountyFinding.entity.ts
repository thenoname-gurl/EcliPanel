import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn } from 'typeorm';

@Entity()
export class LuminosBountyFinding {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column()
  bountyId: number;

  @Column()
  userId: number;

  @Column({ length: 120 })
  title: string;

  @Column({ length: 32, nullable: true })
  vulnType?: string;

  @Column({ nullable: true, type: 'text' })
  affectedAsset?: string;

  @Column('text')
  content: string;

  @Column({ length: 16, default: 'pending' })
  status: string;

  @Column({ default: false })
  disclosureRequested: boolean;

  @Column({ default: false })
  disclosed: boolean;

  @Column({ length: 16, nullable: true })
  severity?: string;

  @Column({ nullable: true })
  decidedBy?: number;

  @Column('datetime', { nullable: true })
  decidedAt?: Date;

  @Column('int', { nullable: true })
  awardedPoints?: number;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;
}
