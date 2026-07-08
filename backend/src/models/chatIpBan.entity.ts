import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
} from 'typeorm';

@Entity()
@Index(['ipHash'])
@Index(['userId'])
export class ChatIpBan {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 64 })
  ipHash: string;

  @Column({ nullable: true })
  userId: number | null;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Column({ nullable: true })
  bannedById: number | null;

  @Column({ nullable: true })
  expiresAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}