import { EmailVerify } from './EmailVerify';
import { PasswordReset } from './PasswordReset';
import { Invite } from './Invite';
import { Notification } from './Notification';
import { TfaEmail } from './TfaEmail';
import { Verification } from './Verification';
import { EmailRestore } from './EmailRestore';
import { DeletionApproved } from './DeletionApproved';
import { DeletionDeleted } from './DeletionDeleted';
import { DeletionRejected } from './DeletionRejected';
import { SunsetPolicy } from './SunsetPolicy';

export const emailTemplates = {
  'email-verify': EmailVerify,
  'password-reset': PasswordReset,
  'invite': Invite,
  'notification': Notification,
  'tfa-email': TfaEmail,
  'verification': Verification,
  'email-restore': EmailRestore,
  'deletion-approved': DeletionApproved,
  'deletion-deleted': DeletionDeleted,
  'deletion-rejected': DeletionRejected,
  'sunset-policy': SunsetPolicy,
} as const;

export type TemplateName = keyof typeof emailTemplates;