import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity()
export class Paint {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column()
  userId: number;

  @Column({ default: 'Untitled' })
  title: string;

  @Column('text', { nullable: true })
  description: string;

  @Column('longtext', { nullable: true })
  canvasData: string;

  @Column('text', { nullable: true })
  thumbnail: string;

  @Column({ default: 800 })
  width: number;

  @Column({ default: 600 })
  height: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}