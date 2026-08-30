import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn } from 'typeorm';

@Entity()
@Index(['giveawayId', 'userId'], { unique: true })
export class LuminosGiveawayEntry {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column()
  giveawayId: number;

  @Column()
  userId: number;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;
}
