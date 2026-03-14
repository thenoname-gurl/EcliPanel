import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class IDVerification {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @Column()
  status: string;

  @Column()
  provider: string;

  @Column('datetime', { nullable: true })
  verifiedAt?: Date;

  @Column('text', { nullable: true })
  idDocumentUrl?: string;

  @Column('text', { nullable: true })
  selfieUrl?: string;
}
