import { createHash, randomBytes } from 'node:crypto';

export function createRefreshToken(): { token: string; hash: string } {
  const token = randomBytes(48).toString('base64url');
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function hashRequest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
