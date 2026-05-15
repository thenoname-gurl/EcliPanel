import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index, Unique } from 'typeorm';

@Entity()
@Unique(['rolloutId', 'userId'])
export class RolloutUserOverride {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column()
  rolloutId: number;

  @Column()
  userId: number;

  @CreateDateColumn()
  createdAt: Date;
}