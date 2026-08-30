import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn } from 'typeorm';

@Entity()
export class LuminosBountyComment {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column()
  findingId: number;

  @Column()
  userId: number;

  @Column('text')
  content: string;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;
}
