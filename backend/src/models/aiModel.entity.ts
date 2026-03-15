import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class AIModel {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column('json', { nullable: true })
  config?: Record<string, any>;

  @Column('json', { nullable: true })
  limits?: Record<string, any>;

  @Column({ nullable: true })
  endpoint?: string;

  @Column({ nullable: true })
  apiKey?: string;

  @Column('json', { nullable: true })
  tags?: string[];
}
