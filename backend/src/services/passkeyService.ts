import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import { AppDataSource } from '../config/typeorm';
import { Passkey } from '../models/passkey.entity';
import base64url from 'base64url';
import crypto from 'crypto';
import { isoBase64URL, decodeAttestationObject, parseAuthenticatorData } from '@simplewebauthn/server/helpers';

const rpName = 'Ecli Panel';
const rpID: string | string[] = process.env.RP_ID
  ? process.env.RP_ID.split(',').map((s) => s.trim())
  : 'ecli.app';
const origin: string | string[] = process.env.ORIGIN
  ? process.env.ORIGIN.split(',').map((s) => s.trim())
  : 'https://ecli.app'; 
  // FUN FACT: This was meant to be panel.ecli.app originally but yes, here we are

function selectRpId(requestHost?: string) {
  if (requestHost && Array.isArray(rpID)) {
    return rpID.find((id) => requestHost === id) ||
      rpID.filter((id) => requestHost.endsWith('.' + id))
        .sort((a, b) => b.length - a.length)[0] ||
      rpID[0];
  }
  return Array.isArray(rpID) ? rpID[0] : rpID;
}

function selectExpectedOrigin(requestOrigin?: string) {
  if (!requestOrigin) return origin;
  if (Array.isArray(origin)) {
    return Array.from(new Set([...origin, requestOrigin]));
  }
  return [origin, requestOrigin];
}

export class PasskeyService {
  static async generateRegistration(user: { id: number; email: string }, requestHost?: string) {
    const selectedRPID = selectRpId(requestHost);
    const opts = generateRegistrationOptions({
      rpName,
      rpID: selectedRPID,
      userID: Buffer.from(String(user.id), 'utf8'),
      userName: user.email,
      attestationType: 'none',
      authenticatorSelection: {
        userVerification: 'preferred',
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
      const attestationBase64 = attestationResponse.response?.attestationObject || attestationResponse.attestationObject;
      const attBuf = isoBase64URL.toBuffer(attestationBase64);
      const decodedCBOR = decodeAttestationObject(attBuf);
      const authData = decodedCBOR.get('authData');
      const parsed = parseAuthenticatorData(authData);
      const buf = Buffer.from(parsed.rpIdHash);
      if (Array.isArray(rpID)) {
        rpID.forEach((id) => {
          const h = crypto.createHash('sha256').update(id).digest();
          console.log(`  expected rpIdHash for ${id}:`, h.toString('hex'), 'match:', h.equals(buf));
        });
      } else {
        const h = crypto.createHash('sha256').update(rpID).digest();
        console.log('  expected rpIdHash for', rpID, ':', h.toString('hex'), 'match:', h.equals(buf));
      }
    } catch (e) {
      console.log('  failed to decode attestationObject for rpIdHash:', e);
    }

    const selectedRPID = selectRpId(requestHost);
    const verification = await verifyRegistrationResponse({
      response: attestationResponse,
      expectedChallenge,
      expectedOrigin: selectExpectedOrigin(requestOrigin),
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
      const transports: string[] = info.credential?.transports
        || attestationResponse.response?.transports
        || ['internal'];
      const transport = Array.isArray(transports) ? transports.join(',') : String(transports);

      const passkeyRepo = AppDataSource.getRepository(Passkey);
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

  static async generateAuthentication(userId: number, requestHost?: string) {
    const passkeyRepo = AppDataSource.getRepository(Passkey);
    const keys = await passkeyRepo.find({ where: { user: { id: userId } } });
    const selectedRPID = selectRpId(requestHost);
    console.log('[PasskeyService] generateAuthentication frontendHost:', requestHost, 'availableRPIDs:', rpID, 'selectedRPID:', selectedRPID);
    const opts: any = generateAuthenticationOptions({
      allowCredentials: keys.map((k) => ({
        id: k.credentialID,
        type: 'public-key',
        transports: k.transports.split(',').filter(Boolean) as any,
      })),
      userVerification: 'preferred',
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
    const passkeyRepo = AppDataSource.getRepository(Passkey);
    const credID = base64url.encode(authenticationResponse.rawId);
    let passkey = await passkeyRepo.findOne({ where: { credentialID: credID } });
    if (!passkey) {
      passkey = await passkeyRepo.findOne({ where: { credentialID: authenticationResponse.id } });
    }
    if (!passkey) throw new Error('Passkey not found');
    const selectedRPID = selectRpId(requestHost);
    const verification = await verifyAuthenticationResponse({
      response: authenticationResponse,
      expectedChallenge,
      expectedOrigin: selectExpectedOrigin(requestOrigin),
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
