import { Entity, PrimaryGeneratedColumn, Column, OneToMany, ManyToOne, JoinColumn } from 'typeorm';
import type { Permission } from './permission.entity';
import type { UserRole } from './userRole.entity';

@Entity()
export class Role {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  name: string;

  @Column({ nullable: true })
  description?: string;

  @Column({ nullable: true })
  parentRoleId?: number;

  @ManyToOne(() => Role, (role) => role.children, { nullable: true })
  @JoinColumn({ name: 'parentRoleId' })
  parentRole?: Role;

  @OneToMany(() => Role, (role) => role.parentRole)
  children?: Role[];

  @OneToMany(() => require('./permission.entity').Permission, (perm: any) => perm.role)
  permissions: Permission[];

  @OneToMany(() => require('./userRole.entity').UserRole, (ur: any) => ur.role)
  userRoles: UserRole[];
}
