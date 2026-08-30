import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn } from 'typeorm';

@Entity()
@Index(['eventId', 'userId'], { unique: true })
export class LuminosEventRsvp {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column()
  eventId: number;

  @Column()
  userId: number;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;
}
