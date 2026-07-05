import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity()
export class CalendarBooking {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column({ nullable: true })
  eventId: number;

  @Index()
  @Column({ nullable: true })
  scheduleId: number;

  @Column()
  name: string;

  @Column()
  email: string;

  @Column('json', { nullable: true })
  data: Record<string, string>;

  @CreateDateColumn()
  createdAt: Date;
}