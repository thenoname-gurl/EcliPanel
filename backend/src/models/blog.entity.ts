import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export type BlogVisibility = 'public' | 'members' | 'unlisted';

@Entity()
export class Blog {
  @PrimaryGeneratedColumn()
  id: number;

  @Index({ unique: true })
  @Column()
  slug: string;

  @Index()
  @Column()
  userId: number;

  @Index()
  @Column({ nullable: true })
  organisationId: number;

  @Column()
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'text', nullable: true })
  coverImageUrl: string;

  @Column({ type: 'varchar', length: 20, default: 'public' })
  visibility: BlogVisibility;

  @Column({ type: 'json', nullable: true })
  theme: Record<string, any>;

  @Column({ type: 'json', nullable: true })
  layout: Record<string, any>;

  @Column({ type: 'json', nullable: true })
  contentFlags: string[];

  @Column({ default: false })
  isMature: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}