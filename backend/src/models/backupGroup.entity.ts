import { Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity({ name: 'backup_groups' })
export class BackupGroup {
  @PrimaryColumn()
  uuid: string;

  @Column({ length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Index()
  @Column()
  serverUuid: string;

  @Column('json', { default: '[]' })
  backupUuids: string[];

  @Column({ type: 'text', nullable: true })
  compressionType?: string;

  @Column({ default: false })
  locked: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}