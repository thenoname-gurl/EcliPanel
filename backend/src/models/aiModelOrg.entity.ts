import { Entity, PrimaryGeneratedColumn, ManyToOne, Column } from 'typeorm';
import { AIModel } from './aiModel.entity';
import { Organisation } from './organisation.entity';

@Entity()
export class AIModelOrg {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => AIModel, (m) => m.id)
  model: AIModel;

  @ManyToOne(() => Organisation, (o) => o.id)
  organisation: Organisation;

  @Column('json', { nullable: true })
  limits?: Record<string, any>;
}
