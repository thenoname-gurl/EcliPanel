import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
} from 'typeorm';

@Entity()
export class VoiceRoom {
  @PrimaryGeneratedColumn()
  id: number;

  @Index({ unique: true })
  @Column({ length: 32 })
  slug: string;

  @Index()
  @Column({ nullable: true })
  channelId: number | null;

  @Column({ nullable: true })
  createdById: number | null;

  @Column({ default: false })
  isPrivate: boolean;

  @CreateDateColumn()
  createdAt: Date;
}