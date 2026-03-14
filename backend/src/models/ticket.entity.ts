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

  @Column({ default: 'open' })
  status: string;

  @Column({ default: 'medium' })
  priority: string;

  @Column({ type: 'text', nullable: true })
  adminReply: string | null;

  @CreateDateColumn()
  created: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
