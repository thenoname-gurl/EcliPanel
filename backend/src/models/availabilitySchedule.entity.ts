import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity()
export class AvailabilitySchedule {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column()
  userId: number;

  @Column()
  name: string;

  @Column('text', { nullable: true })
  description: string;

  @Index({ unique: true })
  @Column()
  slug: string;

  @Column({ default: 60 })
  slotDuration: number;

  @Column({ default: 0 })
  bufferMinutes: number;

  @Column({ default: '09:00' })
  availableStartTime: string;

  @Column({ default: '17:00' })
  availableEndTime: string;

  @Column('json', { nullable: true })
  availableDays: number[];

  @Column({ nullable: true })
  bookingStartDate: string;

  @Column({ nullable: true })
  bookingEndDate: string;

  @Column({ default: 1 })
  maxCapacity: number;

  @Column('json', { nullable: true })
  bookingFields: { key: string; label: string; required: boolean; type: string }[];

  @Column({ default: '#8b5cf6' })
  color: string;

  @Column({ default: true })
  active: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}