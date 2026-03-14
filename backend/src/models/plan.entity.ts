import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class Plan {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column()
  type: string;

  @Column('float', { default: 0 })
  price: number;

  @Column({ nullable: true, type: 'text' })
  description?: string;

  @Column({ nullable: true })
  memory?: number;

  @Column({ nullable: true })
  disk?: number;

  @Column({ nullable: true })
  cpu?: number;

  @Column({ nullable: true })
  serverLimit?: number;

  @Column({ default: 1 })
  portCount: number;

  @Column({ default: false })
  isDefault: boolean;

  @Column('json', { nullable: true })
  features?: Record<string, any>;
}
