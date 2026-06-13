import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity()
export class EloDevlog {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column()
  projectId: number;

  @Index()
  @Column()
  userId: number;

  @Column()
  title: string;

  @Column('text')
  content: string;

  @Column('json', { nullable: true })
  tags?: string[];

  @Column('json', { nullable: true })
  images?: string[];

  @Column({ nullable: true, type: 'datetime' })
  publishedAt?: Date;

  @CreateDateColumn()
  createdAt: Date;
}
