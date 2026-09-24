import { Entity, PrimaryColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity()
export class ServerTunnel {
  @PrimaryColumn()
  serverUuid: string;

  @Index({ unique: true })
  @Column({ type: 'int' })
  idx: number;

  @Column({ length: 63 })
  name: string;

  @Column({ length: 16, nullable: true })
  alias?: string;

  @CreateDateColumn()
  createdAt: Date;
}