import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity()
export class PaintBrush {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column()
  userId: number;

  @Column()
  name: string;

  @Column({ default: 'round' })
  tipShape: string;

  @Column('json')
  settings: string;

  @Column({ default: false })
  isPublic: boolean;

  @Column({ default: 0 })
  downloads: number;

  @Column('text', { nullable: true })
  previewData: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
