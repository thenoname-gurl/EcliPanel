import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn } from 'typeorm';

@Entity()
@Index(['userId'], { unique: true })
export class MailboxAccount {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @Column({ unique: true })
  uuid: string;

  @Column()
  localPart: string;

  @Column()
  domain: string;

  @Column()
  email: string;

  @Column({ nullable: true })
  password?: string;

  @Column({ nullable: true })
  imapHost?: string;

  @Column({ nullable: true })
  imapPort?: number;

  @Column({ default: true })
  imapSecure: boolean;

  @Column({ nullable: true })
  smtpHost?: string;

  @Column({ nullable: true })
  smtpPort?: number;

  @Column({ default: true })
  smtpSecure: boolean;

  @Column({ default: true })
  enabled: boolean;

  @Column({ type: 'json', nullable: true })
  aliases?: Array<{
    address: string;
    canSendFrom?: boolean;
    createdAt?: string;
  }>;

  @CreateDateColumn()
  createdAt: Date;
}