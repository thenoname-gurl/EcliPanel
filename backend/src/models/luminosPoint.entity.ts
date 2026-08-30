import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn } from 'typeorm';

@Entity()
export class LuminosPoint {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column()
  userId: number;

  @Column('int')
  amount: number;

  @Column({ length: 32 })
  reason: string;

  @Column({ nullable: true })
  referenceId?: number;

  @Column({ nullable: true, type: 'text' })
  note?: string;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;
}
