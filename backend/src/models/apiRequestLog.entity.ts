import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class ApiRequestLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: true })
  userId?: number;

  @Column({ nullable: true })
  organisationId?: number;

  @Column()
  endpoint: string;

  @Column('int')
  count: number;

  @Column('datetime')
  timestamp: Date;
}