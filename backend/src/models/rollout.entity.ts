import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity()
export class Rollout {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 128 })
  name: string;

  @Column('text', { nullable: true })
  description: string;

  @Column({ length: 64, unique: true })
  key: string;

  @Column({ default: true })
  active: boolean;

  @Column({ default: 0 })
  hashRangeStart: number;

  @Column({ default: 9999 })
  hashRangeEnd: number;

  @Column({ length: 32, default: 'treatment' })
  treatment: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}