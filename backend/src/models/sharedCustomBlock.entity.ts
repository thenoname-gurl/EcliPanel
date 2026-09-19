import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity()
export class SharedCustomBlock {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column()
  authorUserId: number;

  @Column({ type: 'text', nullable: true })
  authorName: string;

  @Index()
  @Column()
  name: string;

  @Column({ type: 'longtext' })
  code: string;

  @Column({ type: 'longtext', nullable: true })
  blocksData: string;

  @Column({ type: 'longtext', nullable: true })
  settingsDefinition: string;

  @Column({ type: 'longtext', nullable: true })
  description: string;

  @Column({ type: 'text', nullable: true })
  tags: string;

  @Column({ type: 'int', default: 0 })
  downloads: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}