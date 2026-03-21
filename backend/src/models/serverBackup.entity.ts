import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity()
export class ServerBackup {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column({ nullable: true })
  serverUuid?: string;

  @Index({ unique: true })
  @Column()
  uuid: string;

  @Column({ default: 'wings' })
  adapter: string;

  @Column({ nullable: true, type: 'text' })
  name?: string;

  @Column({ nullable: true, type: 'text' })
  displayName?: string;

  @Column({ default: 0 })
  bytes: number;

  @Column({ nullable: true })
  checksum?: string;

  @Column({ nullable: true })
  checksumType?: string;

  @Column('json', { nullable: true })
  parts?: any;

  @Column({ default: false })
  browsable: boolean;

  @Column({ default: false })
  streaming: boolean;

  @Column({ default: 0 })
  progress: number;

  @Column({ nullable: true, type: 'text' })
  status?: string;

  @Column({ default: false })
  locked: boolean;

  @Column('json', { nullable: true })
  raw?: any;

  @CreateDateColumn()
  createdAt: Date;
}
