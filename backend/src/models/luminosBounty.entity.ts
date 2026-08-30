import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity()
export class LuminosBounty {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  title: string;

  @Column('text', { nullable: true })
  description?: string;

  @Column({ nullable: true, type: 'text' })
  repoUrl?: string;

  @Column()
  ownerId: number;

  @Column({ default: false })
  isArchived: boolean;

  @Column({ default: false })
  isPublished: boolean;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;
}
