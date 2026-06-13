import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity()
export class EloReport {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column()
  reporterId: number;

  @Index()
  @Column()
  targetType: string;

  @Column()
  targetId: number;

  @Column('text')
  reason: string;

  @Column({ nullable: true })
  resolvedById: number | null;

  @Column({ nullable: true, type: 'datetime' })
  resolvedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
