import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { env } from '../../config/env.js';

const COOKIE_NAME = 'rds_refresh';

export function setRefreshCookie(c: Context, token: string): void {
  setCookie(c, COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: 'Lax',
    path: '/api/v1/auth',
    maxAge: env.SESSION_TTL_DAYS * 86400,
  });
}

export function readRefreshCookie(c: Context): string | undefined {
  return getCookie(c, COOKIE_NAME);
}

export function clearRefreshCookie(c: Context): void {
  deleteCookie(c, COOKIE_NAME, { path: '/api/v1/auth', secure: env.COOKIE_SECURE, httpOnly: true, sameSite: 'Lax' });
}
