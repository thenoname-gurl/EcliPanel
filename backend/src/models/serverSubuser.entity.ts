import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn } from 'typeorm';

@Entity()
@Index(['serverUuid', 'userId'], { unique: true })
export class ServerSubuser {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  @Index()
  serverUuid: string;

  @Column()
  @Index()
  userId: number;

  @Column({ nullable: true, type: 'text' })
  userEmail?: string;

  @Column('json')
  permissions: string[];

  @CreateDateColumn()
  createdAt: Date;
}
