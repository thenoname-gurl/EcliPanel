import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity()
@Index(['userId', 'eventId'], { unique: true })
export class EventReminder {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  @Index()
  userId: number;

  @Column()
  eventId: number;

  @Column({ default: 5 })
  remindMinutesBefore: number;

  @CreateDateColumn()
  createdAt: Date;
}
