import { Index, Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity()
export class ServerMount {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  @Index()
  serverUuid: string;

  @Column()
  mountId: number;

  @CreateDateColumn()
  createdAt: Date;
}
