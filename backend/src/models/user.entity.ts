import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, BeforeInsert, BeforeUpdate, AfterLoad, JoinColumn, AfterInsert, AfterUpdate } from 'typeorm';
import { Organisation } from './organisation.entity';
import { UserRole } from './userRole.entity';
import { Passkey } from './passkey.entity';
import { ApiKey } from './apiKey.entity';
import { Node } from './node.entity';

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('text')
  firstName: string;

  @Column({ nullable: true })
  middleName?: string;

  @Column('text')
  lastName: string;

  @Column({ nullable: true })
  displayName?: string;

  @Column('text')
  address: string;

  @Column('text', { nullable: true })
  address2?: string;

  @Column('text', { nullable: true })
  phone?: string;

  @Column('text', { nullable: true })
  dateOfBirth?: Date | string;

  @ManyToOne(() => User, (user) => user.children, { nullable: true })
  @JoinColumn({ name: 'parentId' })
  parent?: User;

  @Column({ nullable: true })
  parentId?: number;

  @OneToMany(() => User, (user) => user.parent)
  children?: User[];

  @AfterLoad()
  afterLoadDecrypt() {
    try {
      const { decrypt, encrypt, isEncryptedString, isLegacyEncryptedString } = require('../utils/crypto');
      const legacyUpdates: Record<string, string> = {};

      const normalizeField = (fieldName: keyof User, value: any) => {
        if (value && isEncryptedString(value)) {
          const decrypted = decrypt(value);
          if (isLegacyEncryptedString(value)) {
            legacyUpdates[fieldName as string] = decrypted;
          }
          return decrypted;
        }
        return value;
      };

      this.address = normalizeField('address', this.address);
      this.address2 = normalizeField('address2', this.address2);
      this.phone = normalizeField('phone', this.phone);
      this.firstName = normalizeField('firstName', this.firstName);
      this.lastName = normalizeField('lastName', this.lastName);
      this.billingCompany = normalizeField('billingCompany', this.billingCompany);
      this.billingCity = normalizeField('billingCity', this.billingCity);
      this.billingState = normalizeField('billingState', this.billingState);
      this.billingZip = normalizeField('billingZip', this.billingZip);
      this.billingCountry = normalizeField('billingCountry', this.billingCountry);
      if (this.dateOfBirth && isEncryptedString(this.dateOfBirth)) {
        const decrypted = decrypt(this.dateOfBirth);
        if (isLegacyEncryptedString(this.dateOfBirth)) {
          legacyUpdates.dateOfBirth = decrypted;
        }
        this.dateOfBirth = new Date(decrypted);
      }

      if (this.id && Object.keys(legacyUpdates).length > 0) {
        try {
          const { AppDataSource } = require('../config/typeorm');
          if (AppDataSource?.isInitialized) {
            const repo = AppDataSource.getRepository(this.constructor as any);
            const updatePayload: any = {};
            for (const [key, plaintext] of Object.entries(legacyUpdates)) {
              updatePayload[key] = encrypt(plaintext);
            }
            void repo.update(this.id, updatePayload).catch(() => {});
          }
        } catch (e) {
          console.log(`Error updating legacy encrypted fields for user ${this.id}: ${e}`);
        }
      }
    } catch (e) {
      //skip
    }
  }

  @BeforeInsert()
  @BeforeUpdate()
  encryptFieldsBeforeSave() {
    try {
      const { encrypt, isEncryptedString } = require('../utils/crypto');
      const isEnc = (v: any) => isEncryptedString(v);
      if (this.address && !isEnc(this.address)) {
        this.address = encrypt(this.address);
      }
      if (this.address2 && !isEnc(this.address2)) {
        this.address2 = encrypt(this.address2);
      }
      if (this.phone && !isEnc(this.phone)) {
        this.phone = encrypt(this.phone);
      }
      if (this.firstName && !isEnc(this.firstName)) {
        this.firstName = encrypt(this.firstName);
      }
      if (this.lastName && !isEnc(this.lastName)) {
        this.lastName = encrypt(this.lastName);
      }
      if (this.billingCompany && !isEnc(this.billingCompany)) {
        this.billingCompany = encrypt(this.billingCompany);
      }
      if (this.billingCity && !isEnc(this.billingCity)) {
        this.billingCity = encrypt(this.billingCity);
      }
      if (this.billingState && !isEnc(this.billingState)) {
        this.billingState = encrypt(this.billingState);
      }
      if (this.billingZip && !isEnc(this.billingZip)) {
        this.billingZip = encrypt(this.billingZip);
      }
      if (this.billingCountry && !isEnc(this.billingCountry)) {
        this.billingCountry = encrypt(this.billingCountry);
      }
      if (this.dateOfBirth && !isEnc(this.dateOfBirth)) {
        let dobValue = this.dateOfBirth;
        if (dobValue instanceof Date) {
          dobValue = dobValue.toISOString().split('T')[0];
        }
        this.dateOfBirth = encrypt(String(dobValue));
      }
    } catch (e) {
      // skip
    }
  }

  @AfterInsert()
  @AfterUpdate()
  decryptFieldsAfterSave() {
    this.afterLoadDecrypt();
  }

  @Column('text', { nullable: true })
  billingCompany?: string;

  @Column('text', { nullable: true })
  billingCity?: string;

  @Column('text', { nullable: true })
  billingState?: string;

  @Column('text', { nullable: true })
  billingZip?: string;

  @Column('text', { nullable: true })
  billingCountry?: string;

  @Column({ default: false })
  fraudFlag: boolean;

  @Column('text', { nullable: true })
  fraudReason?: string;

  @Column({ nullable: true })
  fraudDetectedAt?: Date;

  @Column({ unique: true })
  email: string;

  @Column()
  passwordHash: string;

  @Column({ nullable: true })
  role?: string;

  @Column({ default: 'member' })
  orgRole: 'member' | 'admin' | 'owner';

  @Column({ default: 'free' })
  portalType: string;

  @ManyToOne(() => Organisation, { nullable: true })
  org?: Organisation;

  @ManyToOne(() => Node, { nullable: true })
  node?: Node;

  @Column({ nullable: true })
  nodeId?: number;
  @OneToMany(() => UserRole, (ur) => ur.user)
  userRoles: UserRole[];

  @OneToMany(() => ApiKey, (k) => k.user)
  apiKeys: ApiKey[];

  @OneToMany(() => Passkey, (p) => p.user)
  passkeys: Passkey[];

  @OneToMany(() => require('./organisationMember.entity').OrganisationMember, (membership: any) => membership.user)
  organisationMemberships: import('./organisationMember.entity').OrganisationMember[];

  @Column('json', { nullable: true })
  limits?: Record<string, any>;

  @Column('json', { nullable: true })
  settings?: Record<string, any>;

  @Column('json', { nullable: true })
  sessions?: string[];

  @Column({ default: false })
  emailVerified: boolean;

  @Column({ default: false })
  studentVerified: boolean;

  @Column({ nullable: true })
  studentVerifiedAt?: Date;

  @Column('json', { nullable: true })
  educationLimits?: Record<string, any>;

  @Column({ default: false })
  idVerified: boolean;
  
  @Column({ default: false })
  twoFactorEnabled: boolean;

  @Column({ nullable: true })
  twoFactorSecret?: string;

  @Column('json', { nullable: true })
  twoFactorRecoveryCodes?: string[];

  @Column({ default: false })
  suspended: boolean;

  @Column({ default: false })
  supportBanned: boolean;

  @Column('text', { nullable: true })
  supportBanReason?: string;

  @Column({ default: false })
  deletionRequested: boolean;

  @Column({ default: false })
  deletionApproved: boolean;

  @Column({ nullable: true })
  pendingDeletionUntil?: Date;

  @Column({ nullable: true })
  deletedAt?: Date;

  @Column({ nullable: true })
  demoOriginalPortalType?: string;

  @Column({ nullable: true })
  demoExpiresAt?: Date;

  @Column('json', { nullable: true })
  demoLimits?: { tokens?: number; requests?: number };

  @Column({ default: false })
  demoUsed: boolean;

  @Column({ nullable: true })
  avatarUrl?: string;

  @Column({ default: false })
  guideShown: boolean;
}
