import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity()
export class ChatChannel {
  @PrimaryGeneratedColumn()
  id: number;

  @Index({ unique: true })
  @Column({ length: 128, charset: 'utf8mb4', collation: 'utf8mb4_unicode_ci' })
  slug: string;

  @Column({ length: 255, charset: 'utf8mb4', collation: 'utf8mb4_unicode_ci' })
  name: string;

  @Column({ type: 'text', nullable: true, charset: 'utf8mb4', collation: 'utf8mb4_unicode_ci' })
  description: string | null;

  @Column({ length: 32, default: 'community' })
  type: string;

  @Column({ nullable: true })
  createdById: number | null;

  @Index(['isArchived', 'isListed', 'type'])
  @Column({ default: true })
  isListed: boolean;

  @Column({ default: false })
  isArchived: boolean;

  @Column({ default: false })
  isMature: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}