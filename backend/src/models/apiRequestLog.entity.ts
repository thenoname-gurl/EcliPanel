import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity()
export class ApiRequestLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column({ nullable: true })
  userId?: number;

  @Index()
  @Column({ nullable: true })
  organisationId?: number;

  @Index()
  @Column()
  endpoint: string;

  @Column('int')
  count: number;

  @Index()
  @Column('datetime')
  timestamp: Date;
}