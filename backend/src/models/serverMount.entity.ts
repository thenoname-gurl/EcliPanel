import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity()
export class ServerMount {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  serverUuid: string;

  @Column()
  mountId: number;

  @CreateDateColumn()
  createdAt: Date;
}
