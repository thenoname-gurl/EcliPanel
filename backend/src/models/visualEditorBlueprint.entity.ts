import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity()
export class VisualEditorBlueprint {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column()
  userId: number;

  @Column('text')
  name: string;

  @Column('text', { nullable: true })
  description: string;

  @Column({ type: 'longtext' })
  projectData: string;

  @Column({ type: 'longtext', nullable: true })
  latestGeneratedCode: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}