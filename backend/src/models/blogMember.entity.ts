import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
} from 'typeorm';

export type BlogMemberRole = 'owner' | 'admin' | 'author';

@Entity()
@Index(['blogId', 'userId'], { unique: true })
export class BlogMember {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column()
  blogId: number;

  @Index()
  @Column()
  userId: number;

  @Column({ type: 'varchar', length: 20, default: 'author' })
  role: BlogMemberRole;

  @Column({ type: 'varchar', length: 128, nullable: true })
  displayName: string;

  @Column({ type: 'text', nullable: true })
  avatarUrl: string;

  @Column({ type: 'text', nullable: true })
  bio: string;

  @CreateDateColumn()
  createdAt: Date;
}