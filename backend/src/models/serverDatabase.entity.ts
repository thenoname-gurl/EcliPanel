import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity()
export class ServerDatabase {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  serverUuid: string;

  @Column()
  hostId: number;

  @Column({ unique: true })
  name: string;

  @Column({ unique: true })
  username: string;

  @Column({ type: 'text' })
  password: string;

  @Column({ nullable: true })
  label?: string;

  @CreateDateColumn()
  createdAt: Date;
}