import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

/**
 * A user-defined, reusable custom block for the Visual Editor. Backed by a
 * custom-code snippet (or a block subtree) so it can be created once, saved,
 * and linked onto any canvas later.
 */
@Entity()
export class VisualEditorCustomBlock {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column()
  userId: number;

  @Index()
  @Column()
  name: string;

  /** Raw TypeScript custom-code snippet backing this block. */
  @Column({ type: 'longtext' })
  code: string;

  /** Optional JSON-encoded Block subtree (for non-custom_code custom blocks). */
  @Column({ type: 'longtext', nullable: true })
  blocksData: string;

  @Column({ type: 'longtext', nullable: true })
  description: string;

  /** JSON array of user-facing setting fields (key, label, type, default, options). */
  @Column({ type: 'longtext', nullable: true })
  settingsDefinition: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}