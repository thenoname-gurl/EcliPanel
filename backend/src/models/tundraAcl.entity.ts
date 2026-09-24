import { Entity, PrimaryGeneratedColumn, Column, Unique, Index, CreateDateColumn } from 'typeorm';

@Entity()
@Unique(['srcServer', 'dstServer'])
export class TundraAcl {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column()
  srcServer: string;

  @Index()
  @Column()
  dstServer: string;

  @Column({ default: true })
  enabled: boolean;

  @CreateDateColumn()
  createdAt: Date;
}