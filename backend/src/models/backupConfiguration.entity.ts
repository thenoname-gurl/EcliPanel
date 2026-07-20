import { Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'backup_configurations' })
export class BackupConfiguration {
  @PrimaryColumn()
  uuid: string;

  @Column({ length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ default: 'local' })
  backupDisk: string;

  @Column({ type: 'json', nullable: true })
  config?: Record<string, any>;

  @Column({ default: false })
  shared: boolean;

  @Column({ default: true })
  maintenanceEnabled: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}