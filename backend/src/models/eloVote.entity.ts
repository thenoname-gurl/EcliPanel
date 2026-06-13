import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity()
export class EloVote {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column()
  voterId: number;

  @Column()
  projectAId: number;

  @Column()
  projectBId: number;

  @Column()
  winnerId: number;

  @Column('float')
  eloDeltaA: number;

  @Column('float')
  eloDeltaB: number;

  @CreateDateColumn()
  createdAt: Date;
}
