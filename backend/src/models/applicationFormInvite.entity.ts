import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity()
export class ApplicationFormInvite {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  formId: number;

  @Column({ type: 'varchar', length: 128, unique: true })
  token: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  label?: string | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  email?: string | null;

  @Column({ type: 'int', default: 0 })
  uses: number;

  @Column({ type: 'int', nullable: true })
  maxUses?: number | null;

  @Column({ nullable: true, type: 'datetime' })
  expiresAt?: Date | null;

  @Column({ default: false })
  revoked: boolean;

  @Column({ nullable: true })
  createdBy?: number | null;

  @CreateDateColumn()
  createdAt: Date;
}