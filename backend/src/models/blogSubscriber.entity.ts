import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
} from 'typeorm';

@Entity()
@Index(['blogId', 'userId'], { unique: true })
export class BlogSubscriber {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column()
  blogId: number;

  @Index()
  @Column()
  userId: number;

  @CreateDateColumn()
  createdAt: Date;
}