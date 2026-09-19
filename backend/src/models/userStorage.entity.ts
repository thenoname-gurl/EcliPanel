import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

const DEFAULT_QUOTA_BYTES = 10 * 1024 * 1024 * 1024; // 10 GB

@Entity()
export class UserStorage {
  @PrimaryGeneratedColumn()
  id: number;

  @Index({ unique: true })
  @Column()
  userId: number;

  @Column()
  storageServerUuid: string;

  @Column()
  nodeId: number;

  @Column({ type: 'bigint', default: DEFAULT_QUOTA_BYTES })
  quotaBytes: number;

  @Column({ type: 'bigint', default: 0 })
  usedBytes: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
