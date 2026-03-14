import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity()
export class Egg {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ nullable: true, type: 'text' })
  description?: string;

  @Column({ nullable: true, type: 'text' })
  author?: string;

  @Column()
  dockerImage: string;

  /**
   * All docker images declared in this egg (PTDL v2).
   * Object: { "display name": "ghcr.io/..." }
   * When null, only dockerImage is available.
   */
  @Column({ type: 'json', nullable: true })
  dockerImages?: Record<string, string>;

  /** {{VAR}} placeholders for env vars */
  @Column({ type: 'text' })
  startup: string;

  /**
   * [{ name, description, env_variable, default_value, user_viewable, user_editable, rules }]
   */
  @Column({ type: 'json', nullable: true })
  envVars?: Record<string, any>[];

  /** JSON object of config file mappings: { "config.json": "{{JSON}}" } */
  @Column({ type: 'json', nullable: true })
  configFiles?: Record<string, string>;

  /**
   * { startup: { done: string[], strip_ansi: bool }, stop: { type, value }, configs: [] }
   */
  @Column({ type: 'json', nullable: true })
  processConfig?: Record<string, any>;

  /**
   * { script: string, container: string, entrypoint: string }
   */
  @Column({ type: 'json', nullable: true })
  installScript?: Record<string, any>;

  /** Feature flags, e.g. ["eula"] | Unironically no support for eula */
  @Column({ type: 'json', nullable: true })
  features?: string[];

  @Column({ type: 'json', nullable: true })
  fileDenylist?: string[];

  @Column({ nullable: true, type: 'text' })
  updateUrl?: string;

  @Column({ default: true })
  visible: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
