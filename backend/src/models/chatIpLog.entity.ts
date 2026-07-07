import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
} from 'typeorm';

@Entity()
@Index(['messageId'])
export class ChatIpLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  messageId: number;

  @Column({ length: 64 })
  ipHash: string;

  @Column({ nullable: true })
  channelId: number | null;

  @CreateDateColumn()
  createdAt: Date;
}