import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity()
export class Feedback {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column()
  userId: number;

  @Column()
  rating: number;

  @Column('text', { nullable: true })
  message: string;

  @CreateDateColumn()
  createdAt: Date;
}