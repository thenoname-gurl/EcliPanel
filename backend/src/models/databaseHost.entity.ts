import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';


@Entity()
export class DatabaseHost {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column()
  host: string;

  @Column({ default: 3306 })
  port: number;

  @Column()
  username: string;

  @Column({ type: 'text' })
  password: string;

  @Column({ nullable: true })
  nodeId?: number;

  @Column({ default: 0 })
  maxDatabases: number;

  @CreateDateColumn()
  createdAt: Date;
}
