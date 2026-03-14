import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity()
export class UserLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  @Index()
  userId: number;

  @Column('text')
  action: string;

  @Column({ nullable: true, type: 'varchar', length: 255 })
  @Index()
  targetId?: string;

  @Column({ nullable: true, type: 'text' })
  targetType?: string;

  @Column('json', { nullable: true })
  metadata?: Record<string, any>;

  @Column({ nullable: true, type: 'text' })
  ipAddress?: string;

  @Column('datetime')
  @Index()
  timestamp: Date;
}
