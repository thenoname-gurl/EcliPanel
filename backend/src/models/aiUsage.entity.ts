import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class AIUsage {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: true })
  userId?: number;

  @Column({ nullable: true })
  organisationId?: number;

  @Column()
  modelId: number;

  @Column('int', { default: 0 })
  tokens: number;

  @Column('int', { default: 0 })
  requests: number;

  @Column('datetime')
  timestamp: Date;
}