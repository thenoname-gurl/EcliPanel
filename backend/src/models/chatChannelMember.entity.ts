import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
} from 'typeorm';

@Entity()
@Index(['channelId', 'userId'], { unique: true })
export class ChatChannelMember {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  channelId: number;

  @Column()
  userId: number;

  @Column({ length: 32, default: 'member' })
  role: string;

  @CreateDateColumn()
  joinedAt: Date;
}