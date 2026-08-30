import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import { AppDataSource } from '../config/typeorm';
import { PanelSetting } from '../models/panelSetting.entity';
import { Passkey } from '../models/passkey.entity';
import base64url from 'base64url';
import { sha256Bytes } from '../utils/bunCrypto';
import {
  isoBase64URL,
  decodeAttestationObject,
  parseAuthenticatorData,
} from '@simplewebauthn/server/helpers';

const rpName = 'Ecli Panel';
const envRpId: string[] = process.env.RP_ID
  ? process.env.RP_ID.split(',').map(s => s.trim())
  : ['ecli.app'];
const envOrigin: string[] = process.env.ORIGIN
  ? process.env.ORIGIN.split(',').map(s => s.trim())
  : ['https://ecli.app'];
// FUN FACT: This was meant to be panel.ecli.app originally but yes, here we are

export interface WebauthnSettings {
  enabled: boolean;
  allowDiscoverable: boolean;
  rpId: string;
  rpOrigin: string;
  authenticationTimeoutSeconds: number;
  registrationTimeoutSeconds: number;
}

export async function loadWebauthnSettings(): Promise<WebauthnSettings> {
  const defaults: WebauthnSettings = {
    enabled: true,
    allowDiscoverable: false,
    rpId: envRpId[0],
    rpOrigin: envOrigin[0],
    authenticationTimeoutSeconds: 300,
    registrationTimeoutSeconds: 300,
  };
  try {
    const repo = AppDataSource.getRepository(PanelSetting);
    const row = await repo.findOneBy({ key: 'webauthn' });
    if (!row?.value) return defaults;
    return { ...defaults, ...JSON.parse(row.value) };
  } catch {
    return defaults;
  }
}

function selectRpId(requestHost?: string, settings?: WebauthnSettings) {
  if (settings && settings.rpId) return settings.rpId;
  const rpID = envRpId;
  if (requestHost && rpID.length > 1) {
    return (
      rpID.find(id => requestHost === id) ||
      rpID.filter(id => requestHost.endsWith('.' + id)).sort((a, b) => b.length - a.length)[0] ||
      rpID[0]
    );
  }
  return rpID[0];
}

function selectExpectedOrigin(requestOrigin?: string, settings?: WebauthnSettings) {
  const origin = settings && settings.rpOrigin ? [settings.rpOrigin] : envOrigin;
  if (!requestOrigin) return origin;
  return Array.from(new Set([...origin, requestOrigin]));
}

export class PasskeyService {
  static async generateRegistration(user: { id: number; email: string }, requestHost?: string) {
    const settings = await loadWebauthnSettings();
    const selectedRPID = selectRpId(requestHost, settings);
    const opts = generateRegistrationOptions({
      rpName,
      rpID: selectedRPID,
      userID: Buffer.from(String(user.id), 'utf8'),
      userName: user.email,
      attestationType: 'none',
      authenticatorSelection: {
        userVerification: 'preferred',
        residentKey: 'required' as const,
        requireResidentKey: true,
      },
    });
    return opts;
  }

  static async verifyRegistrationResponse({
    userId,
    attestationResponse,
    expectedChallenge,
    requestHost,
    requestOrigin,
  }: {
    userId: number;
    attestationResponse: any;
    expectedChallenge: string;
    requestHost?: string;
    requestOrigin?: string;
  }) {
    const settings = await loadWebauthnSettings();
    if (attestationResponse.response?.clientDataJSON) {
      try {
        const decoded = JSON.parse(base64url.decode(attestationResponse.response.clientDataJSON));
        console.log('  clientData.origin:', decoded.origin);
        console.log('  clientData.type:', decoded.type);
      } catch (e) {
        console.log('  failed to decode clientDataJSON:', e);
      }
    }

    try {
      const attestationBase64 =
        attestationResponse.response?.attestationObject || attestationResponse.attestationObject;
      const attBuf = isoBase64URL.toBuffer(attestationBase64);
      const decodedCBOR = decodeAttestationObject(attBuf);
      const authData = decodedCBOR.get('authData');
      const parsed = parseAuthenticatorData(authData);
      const buf = Buffer.from(parsed.rpIdHash);
      const ids = settings.rpId ? [settings.rpId] : envRpId;
      ids.forEach(id => {
        const h = Buffer.from(sha256Bytes(id));
        console.log(`  expected rpIdHash for ${id}:`, h.toString('hex'), 'match:', h.equals(buf));
      });
    } catch (e) {
      console.log('  failed to decode attestationObject for rpIdHash:', e);
    }

    const selectedRPID = selectRpId(requestHost, settings);
    const verification = await verifyRegistrationResponse({
      response: attestationResponse,
      expectedChallenge,
      expectedOrigin: selectExpectedOrigin(requestOrigin, settings),
      expectedRPID: selectedRPID,
    });
    if (verification.verified) {
      const { registrationInfo } = verification;
      const info: any = registrationInfo;
      const credID = info.credential?.id
        ? String(info.credential.id)
        : base64url.encode(info.credentialID);
      const pk = info.credential?.publicKey
        ? base64url.encode(Buffer.from(info.credential.publicKey))
        : base64url.encode(info.credentialPublicKey);
      const counter = info.credential?.counter ?? info.counter ?? 0;
      const transports: string[] = info.credential?.transports ||
        attestationResponse.response?.transports || ['internal'];
      const transport = Array.isArray(transports) ? transports.join(',') : String(transports);

      const passkeyRepo = AppDataSource.getRepository(Passkey);
      const existing = await passkeyRepo.findOne({ where: { credentialID: credID } });
      if (existing) {
        existing.publicKey = pk;
        existing.counter = counter;
        existing.transports = transport;
        await passkeyRepo.save(existing);
        return verification;
      }
      const existingCount = await passkeyRepo.count({ where: { user: { id: userId } } });
      const passkey = passkeyRepo.create({
        user: { id: userId } as any,
        name: `Passkey #${existingCount + 1}`,
        credentialID: credID,
        publicKey: pk,
        counter,
        transports: transport,
      } as any);
      await passkeyRepo.save(passkey);
    }
    return verification;
  }

  static async generateAuthentication(
    userId: number | null,
    requestHost?: string,
    userVerification?: 'required' | 'preferred'
  ) {
    const settings = await loadWebauthnSettings();
    const passkeyRepo = AppDataSource.getRepository(Passkey);
    const keys = userId
      ? await passkeyRepo.find({ where: { user: { id: userId } } })
      : [];
    const selectedRPID = selectRpId(requestHost, settings);
    console.log(
      '[PasskeyService] generateAuthentication frontendHost:',
      requestHost,
      'selectedRPID:',
      selectedRPID,
      'usernameless:',
      userId === null
    );
    const opts: any = generateAuthenticationOptions({
      allowCredentials: keys.map(k => ({
        id: k.credentialID,
        type: 'public-key',
        transports: k.transports.split(',').filter(Boolean) as any,
      })),
      userVerification: userVerification ?? (userId === null ? 'required' : 'preferred'),
      rpID: selectedRPID,
    });
    return opts;
  }

  static async verifyAuthenticationResponse({
    userId,
    authenticationResponse,
    expectedChallenge,
    requestHost,
    requestOrigin,
  }: {
    userId: number;
    authenticationResponse: any;
    expectedChallenge: string;
    requestHost?: string;
    requestOrigin?: string;
  }) {
    const settings = await loadWebauthnSettings();
    const passkeyRepo = AppDataSource.getRepository(Passkey);
    const credID = base64url.encode(authenticationResponse.rawId);
    let passkey = await passkeyRepo.findOne({ where: { credentialID: credID, user: { id: userId } } });
    if (!passkey) {
      passkey = await passkeyRepo.findOne({
        where: { credentialID: authenticationResponse.id, user: { id: userId } },
      });
    }
    if (!passkey) throw new Error('Passkey not found');
    const selectedRPID = selectRpId(requestHost, settings);
    const verification = await verifyAuthenticationResponse({
      response: authenticationResponse,
      expectedChallenge,
      expectedOrigin: selectExpectedOrigin(requestOrigin, settings),
      expectedRPID: selectedRPID,
      credential: {
        id: passkey.credentialID,
        publicKey: base64url.toBuffer(passkey.publicKey),
        counter: Number(passkey.counter),
      },
    } as any);
    if (verification.verified) {
      passkey.counter = verification.authenticationInfo!.newCounter;
      await passkeyRepo.save(passkey);
    }
    return verification;
  }
}
