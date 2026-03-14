import { Entity, PrimaryGeneratedColumn, ManyToOne, Column } from 'typeorm';
import { AIModel } from './aiModel.entity';
import { User } from './user.entity';

@Entity()
export class AIModelUser {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => AIModel, (m) => m.id)
  model: AIModel;

  @ManyToOne(() => User, (u) => u.id)
  user: User;

  @Column('json', { nullable: true })
  limits?: Record<string, any>;
}
