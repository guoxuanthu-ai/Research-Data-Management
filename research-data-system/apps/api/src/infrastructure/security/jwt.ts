import { SignJWT, jwtVerify } from 'jose';
import { env } from '../../config/env.js';

const key = new TextEncoder().encode(env.JWT_SECRET);

export interface AccessClaims { sub: string; sid: string; version: number }

export async function signAccessToken(userId: string, sessionId: string, version: number): Promise<string> {
  return new SignJWT({ sid: sessionId, version })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(userId)
    .setIssuer('rds-api')
    .setAudience('rds-web')
    .setIssuedAt()
    .setExpirationTime(`${env.ACCESS_TOKEN_TTL_MINUTES}m`)
    .sign(key);
}

export async function verifyAccessToken(token: string): Promise<AccessClaims> {
  const { payload } = await jwtVerify(token, key, { issuer: 'rds-api', audience: 'rds-web' });
  if (!payload.sub || typeof payload.sid !== 'string' || typeof payload.version !== 'number') {
    throw new Error('Invalid access token claims');
  }
  return { sub: payload.sub, sid: payload.sid, version: payload.version };
}
