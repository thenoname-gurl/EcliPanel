import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import type { User } from './user.entity';

@Entity()
export class ApiKey {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  key: string;

  @Column()
  name: string;

  @Column({ type: 'varchar', length: 20 })
  type: 'client' | 'admin';

  @Column('simple-json', { nullable: true })
  permissions?: string[];

  @ManyToOne(() => require('./user.entity').User, (u: any) => u.id, { nullable: true })
  user?: User;

  @Column('datetime')
  createdAt: Date;

  @Column('datetime', { nullable: true })
  expiresAt?: Date;
}
