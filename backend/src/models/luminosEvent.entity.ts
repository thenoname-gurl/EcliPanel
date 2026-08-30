import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity()
export class LuminosEvent {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  title: string;

  @Column('text', { nullable: true })
  description?: string;

  @Index()
  @Column('datetime')
  startsAt: Date;

  @Column({ default: false })
  isArchived: boolean;

  @Column()
  createdById: number;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;
}
