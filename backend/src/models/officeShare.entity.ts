import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
  Unique,
} from 'typeorm';

export type OfficeSharePermission = 'view' | 'comment' | 'edit';

@Entity()
@Unique(['documentId', 'userId'])
export class OfficeShare {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column()
  documentId: number;

  @Index()
  @Column()
  userId: number;

  @Column({ type: 'varchar', length: 16, default: 'view' })
  permission: OfficeSharePermission;

  @CreateDateColumn()
  createdAt: Date;
}