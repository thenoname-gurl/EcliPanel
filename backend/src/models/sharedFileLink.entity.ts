import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity()
@Index(['serverUuid', 'active'])
export class SharedFileLink {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  serverUuid: string;

  @Column({ type: 'text' })
  filePath: string;

  @Column({ default: false })
  isFolder: boolean;

  @Column({ nullable: true })
  createdBy: number;

  @Column({ default: '1d' })
  expiresIn: string;

  @Column({ nullable: true, type: 'datetime' })
  expiresAt: Date;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  token: string;

  @Column({ default: 0 })
  downloads: number;

  @Column({ default: true })
  active: boolean;

  @CreateDateColumn()
  createdAt: Date;
}