import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, Index } from 'typeorm';
import { Organisation } from './organisation.entity';

@Entity()
export class OrganisationInvite {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Organisation)
  organisation: Organisation;

  @Column()
  email: string;

  @Index()
  @Column()
  token: string;

  @Column({ default: false })
  accepted: boolean;

  @Column('datetime')
  createdAt: Date;
}
