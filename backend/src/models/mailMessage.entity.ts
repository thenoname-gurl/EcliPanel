import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn } from 'typeorm';

@Entity()
@Index(['userId', 'read'])
export class MailMessage {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  @Index()
  userId: number;

  @Column()
  fromAddress: string;

  @Column()
  toAddress: string;

  @Column({ nullable: true })
  messageId?: string;

  @Column({ nullable: true })
  imapUid?: number;

  @Column({ nullable: true })
  subject?: string;

  @Column('text')
  body: string;

  @Column({ nullable: true, type: 'text' })
  html?: string;

  @Column({ nullable: true, type: 'simple-json' })
  attachments?: { filename: string; url: string; contentType?: string; size?: number; cid?: string }[];

  @Column({ nullable: true, type: 'text' })
  headers?: string;

  @Column({ nullable: true })
  category?: string;

  @Column({ default: false })
  isSpam: boolean;

  @Column({ nullable: true, type: 'float' })
  spamScore?: number;

  @Column({ default: false })
  isVirus: boolean;

  @Column({ nullable: true })
  virusName?: string;

  @Column({ nullable: true, type: 'text' })
  rawHeaders?: string;

  @Column({ nullable: true })
  senderIp?: string;

  @Column({ nullable: true })
  senderRdns?: string;

  @Column({ default: false })
  favorite: boolean;

  @Column({ nullable: true })
  spfResult?: string;

  @Column({ nullable: true })
  dkimResult?: string;

  @Column({ nullable: true })
  dmarcResult?: string;

  @Column({ nullable: true, type: 'text' })
  authResults?: string;

  @Column({ nullable: true })
  encryptionType?: string;

  @Column({ nullable: true, type: 'simple-json' })
  receivedChain?: { from?: string; by?: string; with?: string; id?: string; for?: string; ip?: string; raw?: string }[];

  @Column({ default: false })
  read: boolean;

  @Column({ type: 'datetime' })
  receivedAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}