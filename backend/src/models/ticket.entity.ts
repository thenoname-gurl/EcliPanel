import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity()
export class Ticket {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @Column()
  subject: string;

  @Column({ type: 'text' })
  message: string;

  @Column({ default: 'opened' })
  status: string;

  @Column({ default: 'medium' })
  priority: string;

  @Column({ nullable: true })
  assignedTo: number | null;

  @Column({ nullable: true })
  department: string | null;

  @Column({ type: 'text', nullable: true })
  adminReply: string | null;

  @Column({ type: 'simple-json', nullable: true })
  messages?: Array<{ sender: 'user' | 'staff'; message: string; created: Date }>;

  @CreateDateColumn()
  created: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
