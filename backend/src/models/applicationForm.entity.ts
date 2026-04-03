import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export type ApplicationFormKind = 'staff_application' | 'abuse_report';
export type ApplicationFormVisibility = 'public_anonymous' | 'public_users' | 'private_invite';
export type ApplicationFormStatus = 'active' | 'archived' | 'closed';

@Entity()
export class ApplicationForm {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  title: string;

  @Column({ type: 'text', nullable: true, charset: 'utf8mb4', collation: 'utf8mb4_unicode_ci' })
  description?: string | null;

  @Column({ type: 'varchar', length: 32, default: 'staff_application' })
  kind: ApplicationFormKind;

  @Column({ type: 'varchar', length: 120, unique: true, nullable: true })
  slug?: string | null;

  @Column({ type: 'varchar', length: 32, default: 'public_users' })
  visibility: ApplicationFormVisibility;

  @Column({ type: 'varchar', length: 24, default: 'active' })
  status: ApplicationFormStatus;

  @Column({ type: 'simple-json', nullable: true, charset: 'utf8mb4', collation: 'utf8mb4_unicode_ci' })
  schema?: {
    title?: string;
    description?: string;
    questions?: Array<{
      id: string;
      label: string;
      type: 'short_text' | 'long_text' | 'email' | 'number' | 'select' | 'multi_select' | 'checkbox' | 'date' | 'url';
      required?: boolean;
      placeholder?: string;
      options?: string[];
    }>;
  } | null;

  @Column({ default: true })
  active: boolean;

  @Column({ default: true })
  requiresAccount: boolean;

  @Column({ default: 1 })
  maxSubmissionsPerUser: number;

  @Column({ default: 0 })
  ipCooldownSeconds: number;

  @Column({ nullable: true })
  createdBy?: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
