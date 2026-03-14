import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class LegalDocument {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  type: string;

  @Column('text')
  content: string;

  @Column()
  version: string;

  @Column('datetime')
  publishedAt: Date;
}
