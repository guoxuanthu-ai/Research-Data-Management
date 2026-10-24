import { randomBytes, randomInt, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import type { ScryptOptions } from 'node:crypto';

function scrypt(password: string, salt: Buffer, keyLength: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keyLength, options, (error, key) => error ? reject(error) : resolve(key));
  });
}
const N = 16384;
const R = 8;
const P = 1;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = (await scrypt(password, salt, 64, { N, r: R, p: P, maxmem: 64 * 1024 * 1024 })) as Buffer;
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  try {
    const [algorithm, n, r, p, salt, expected] = encoded.split('$');
    if (algorithm !== 'scrypt' || !n || !r || !p || !salt || !expected) return false;
    const expectedBuffer = Buffer.from(expected, 'base64url');
    const actual = (await scrypt(password, Buffer.from(salt, 'base64url'), expectedBuffer.length, {
      N: Number(n), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024,
    })) as Buffer;
    return actual.length === expectedBuffer.length && timingSafeEqual(actual, expectedBuffer);
  } catch {
    return false;
  }
}

export function generateInitialPassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  let suffix = '';
  for (let i = 0; i < 12; i += 1) suffix += alphabet[randomInt(alphabet.length)];
  return `Rds!${suffix}`;
}
