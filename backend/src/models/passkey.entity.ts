import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import type { User } from './user.entity';

@Entity()
export class Passkey {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => require('./user.entity').User, (user: any) => user.id)
  user: User;

  @Column()
  credentialID: string;

  @Column('text')
  publicKey: string;

  @Column('bigint')
  counter: number;

  @Column()
  transports: string;
}
