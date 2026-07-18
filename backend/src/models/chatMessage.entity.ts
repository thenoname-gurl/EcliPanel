import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
} from 'typeorm';

@Entity()
@Index(['channelId', 'parentId', 'bumpedAt'])
export class ChatMessage {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column()
  channelId: number;

  @Column({ nullable: true })
  parentId: number | null;

  @Column({ nullable: true })
  userId: number | null;

  @Column({ length: 128, nullable: true, charset: 'utf8mb4', collation: 'utf8mb4_unicode_ci' })
  anonymousId: string | null;

  @Column({ length: 64, nullable: true, charset: 'utf8mb4', collation: 'utf8mb4_unicode_ci' })
  anonymousName: string | null;

  @Index()
  @Column({ length: 16, nullable: true, charset: 'utf8mb4', collation: 'utf8mb4_unicode_ci' })
  posterId: string | null;

  @Column({ type: 'text', charset: 'utf8mb4', collation: 'utf8mb4_unicode_ci' })
  content: string;

  @Column({ length: 64, nullable: true, charset: 'utf8mb4', collation: 'utf8mb4_unicode_ci' })
  displayName: string | null;

  @Column({ length: 512, nullable: true, charset: 'utf8mb4', collation: 'utf8mb4_unicode_ci' })
  avatarUrl: string | null;

  @Column({ nullable: true })
  bumpedAt: Date | null;

  @Column({ length: 512, nullable: true, charset: 'utf8mb4', collation: 'utf8mb4_unicode_ci' })
  imageUrl: string | null;

  @Column({ default: false })
  isLocked: boolean;

  @Column({ default: false })
  isHidden: boolean;

  @Column({ nullable: true })
  hiddenById: number | null;

  @CreateDateColumn()
  createdAt: Date;
}