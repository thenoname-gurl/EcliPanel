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

  @Column({ length: 32, nullable: true })
  treatment: string | null;

  @CreateDateColumn()
  createdAt: Date;
}