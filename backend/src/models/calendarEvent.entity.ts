import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity()
export class CalendarEvent {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column()
  userId: number;

  @Column()
  title: string;

  @Column('text', { nullable: true })
  description: string;

  @Column()
  date: string;

  @Column({ default: '09:00' })
  startTime: string;

  @Column({ default: '10:00' })
  endTime: string;

  @Column({ default: '#8b5cf6' })
  color: string;

  @Column({ default: 'none' })
  recurring: string;

  @Column({ nullable: true })
  recurringEnd: string;

  @Column({ default: false })
  isAppointment: boolean;

  @Column({ nullable: true })
  appointmentEmail: string;

  @Column({ nullable: true })
  appointmentName: string;

  @Column('json', { nullable: true })
  bookingFields: { key: string; label: string; required: boolean; type: string }[];

  @Column('json', { nullable: true })
  bookingData: Record<string, string>;

  @Column({ default: 'call' })
  bookingType: string;

  @Column({ default: 1 })
  maxCapacity: number;

  @Column('json', { nullable: true })
  availableDays: number[];

  @Column({ nullable: true })
  availableStartTime: string;

  @Column({ nullable: true })
  availableEndTime: string;

  @Column({ nullable: true })
  slotDuration: number;

  @Column({ default: 0 })
  bufferMinutes: number;

  @Column({ nullable: true })
  bookingStartDate: string;

  @Column({ nullable: true })
  bookingEndDate: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}