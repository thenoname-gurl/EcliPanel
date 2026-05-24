import type { JsonObject, JsonValue } from './common';
import type { User } from '../models/user.entity';

export interface LoginRequestBody {
  email: string;
  password: string;
}

export interface LoginSuccessResponse {
  token: string;
  csrfToken: string;
  user: SafeUserResponse;
}

export interface TwoFactorRequiredResponse {
  twoFactorRequired: true;
  tempToken: string;
}

export type LoginResponse = LoginSuccessResponse | TwoFactorRequiredResponse;

export interface VerifyTwoFactorRequestBody {
  tempToken: string;
  code: string;
}

export interface RegisterRequestBody {
  firstName: string;
  lastName: string;
  middleName?: string;
  email: string;
  password: string;
  dateOfBirth: string;
  address: string;
  address2?: string;
  phone?: string;
  billingCity?: string;
  billingZip?: string;
  billingCountry?: string;
  captchaToken?: string;
  captchaAnswer?: string;
  invisibleCaptchaToken?: string;
  invisibleCaptchaDelay?: number;
  behaviorData?: JsonObject;
  parentId?: number;
  parentInviteToken?: string;
}

export interface SafeUserResponse {
  id: number;
  email: string;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  displayName?: string | null;
  address?: string | null;
  address2?: string | null;
  phone?: string | null;
  billingCompany?: string | null;
  billingCity?: string | null;
  billingState?: string | null;
  billingZip?: string | null;
  billingCountry?: string | null;
  tier: string;
  role?: string | null;
  sessionId?: string;
  emailVerified: boolean;
  passkeyCount: number;
  studentVerified: boolean;
  twoFactorEnabled: boolean;
  avatarUrl?: string | null;
  supportBanned: boolean;
  supportBanReason?: string | null;
  dateOfBirth?: string | null;
  parentId?: number | null;
  org?: { id: number; name: string; handle: string } | null;
  orgs?: Array<{
    id: number;
    name: string;
    handle: string | null;
    portalTier: string | null;
    avatarUrl: string | null;
    orgRole: string;
  }>;
  orgRole?: string;
  limits?: Record<string, JsonValue> | null;
  nodeId?: number | null;
  geoBlockLevel: number;
  idVerificationAllowed: boolean;
}

export interface UserOrgMembership {
  id: number;
  name: string;
  handle: string | null;
  portalTier: string | null;
  avatarUrl: string | null;
  orgRole: string;
}

export interface ChangePasswordRequestBody {
  currentPassword: string;
  newPassword: string;
}

export interface ResetPasswordStartRequestBody {
  email: string;
}

export interface ResetPasswordCompleteRequestBody {
  token: string;
  password: string;
}

export interface ErrorWithMessage {
  error: string;
}

export interface RateLimitedError extends ErrorWithMessage {
  retryAfter: number;
}
