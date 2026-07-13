import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export type RuleSource = 'user_log' | 'soc_data' | 'server_config' | 'wings_processes' | 'wings_connections';

export type RuleOperator = 'and' | 'or';
export type FieldOperator = 'equals' | 'not_equals' | 'contains' | 'not_contains' | 'regex' | 'not_regex' | 'gt' | 'lt' | 'gte' | 'lte' | 'exists' | 'not_exists';
export type RuleScope = 'global' | 'server' | 'user';

export interface RuleCondition {
  field: string;
  operator: FieldOperator;
  value?: string | number;
}

export interface RuleConditionGroup {
  operator: RuleOperator;
  rules: (RuleCondition | RuleConditionGroup)[];
}

export interface RuleFrequency {
  count: number;
  windowSeconds: number;
}

export interface RuleCorrelation {
  field: string;
  minSources: number;
}

@Entity()
@Index(['enabled'])
@Index(['scope', 'scopeId'])
export class DetectionRule {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 200 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'varchar', length: 50 })
  category: string;

  @Column({ type: 'varchar', length: 20 })
  severity: string;

  @Column({ default: true })
  enabled: boolean;

  @Column('json')
  sources: RuleSource[];

  @Column('json')
  conditions: RuleConditionGroup;

  @Column('json', { nullable: true })
  frequency?: RuleFrequency;

  @Column('json', { nullable: true })
  correlation?: RuleCorrelation;

  @Column({ type: 'varchar', length: 20, default: 'global' })
  scope: RuleScope;

  @Column({ nullable: true, type: 'varchar', length: 36 })
  @Index()
  scopeId?: string;

  @Column({ nullable: true })
  createdByUserId?: number;

  @Column({ default: 0 })
  triggerCount: number;

  @Column({ nullable: true })
  lastTriggeredAt?: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ type: 'varchar', length: 20, default: 'public' })
  visibility: 'public' | 'staff_only';

  @Column({ default: false })
  createsIncident: boolean;
}