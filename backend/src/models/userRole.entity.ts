import { Entity, PrimaryGeneratedColumn, ManyToOne } from 'typeorm';
import type { User } from './user.entity';
import type { Role } from './role.entity';

@Entity()
export class UserRole {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => require('./user.entity').User, (user: any) => user.userRoles)
  user: User;

  @ManyToOne(() => require('./role.entity').Role, (role: any) => role.userRoles)
  role: Role;
}
