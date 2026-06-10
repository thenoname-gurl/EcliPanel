import { Entity, PrimaryGeneratedColumn, ManyToOne, Column } from 'typeorm';
import { AIModel } from './aiModel.entity';
import { Plan } from './plan.entity';

@Entity()
export class AIModelPlan {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => AIModel, m => m.id)
  model: AIModel;

  @ManyToOne(() => Plan, p => p.id)
  plan: Plan;

  @Column('json', { nullable: true })
  limits?: Record<string, any>;
}
