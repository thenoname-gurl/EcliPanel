import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn } from 'typeorm';

@Entity()
@Index(['userId', 'read'])
export class Notification {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  @Index()
  userId: number;

  @Column({ default: 'system' })
  type: string;

  @Column()
  title: string;

  @Column('text')
  body: string;

  @Column({ nullable: true })
  url?: string;

  @Column({ default: false })
  read: boolean;

  @CreateDateColumn()
  createdAt: Date;
}