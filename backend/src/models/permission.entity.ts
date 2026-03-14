import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import type { Role } from './role.entity';

@Entity()
export class Permission {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  value: string;

  @ManyToOne(() => require('./role.entity').Role, (role: any) => role.permissions)
  role: Role;
}
