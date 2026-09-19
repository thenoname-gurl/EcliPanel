import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity()
export class BlockPack {
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

  @Column({ type: 'longtext', nullable: true })
  description: string;

  /* { name, code, settingsDefinition, description } */
  @Column({ type: 'longtext' })
  itemsData: string;

  @Column({ type: 'text', nullable: true })
  tags: string;

  @Column({ type: 'boolean', default: false })
  isPublic: boolean;

  @Column({ type: 'int', default: 0 })
  downloads: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
