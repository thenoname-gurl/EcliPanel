import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity()
export class TodoItem {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column()
  userId: number;

  @Column()
  title: string;

  @Column('text', { nullable: true })
  description: string;

  @Column({ default: 'medium' })
  priority: string;

  @Column({ nullable: true })
  dueDate: string;

  @Column({ nullable: true })
  dueTime: string;

  @Column({ default: 0 })
  estimatedMinutes: number;

  @Column({ default: false })
  completed: boolean;

  @Column({ default: 'general' })
  category: string;

  @Column({ nullable: true })
  weekStart: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}