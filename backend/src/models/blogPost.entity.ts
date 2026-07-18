import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export type PostStatus = 'draft' | 'published';
export type PostVisibility = 'public' | 'members' | 'unlisted';

@Entity()
export class BlogPost {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column()
  blogId: number;

  @Index()
  @Column()
  authorId: number;

  @Column()
  title: string;

  @Index(['blogId', 'slug'], { unique: true })
  @Column()
  slug: string;

  @Column({ type: 'mediumtext', nullable: true })
  content: string;

  @Column({ type: 'text', nullable: true })
  excerpt: string;

  @Column({ type: 'text', nullable: true })
  coverImageUrl: string;

  @Column({ type: 'varchar', length: 20, default: 'draft' })
  status: PostStatus;

  @Column({ type: 'varchar', length: 20, nullable: true })
  visibility: PostVisibility;

  @Column({ type: 'json', nullable: true })
  tags: string[];

  @Column({ type: 'json', nullable: true })
  contentFlags: string[];

  @Column({ default: 0 })
  viewCount: number;

  @Column({ type: 'datetime', nullable: true })
  scheduledAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}