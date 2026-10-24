import type { MiddlewareHandler } from 'hono';
import type { CurrentUserDto, Role } from '@rds/shared';
import { one, type Row } from '../../infrastructure/db/client.js';
import { verifyAccessToken } from '../../infrastructure/security/jwt.js';
import { forbidden, unauthorized } from '../errors.js';
import type { AppEnv } from '../types.js';

export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const authorization = c.req.header('Authorization');
  if (!authorization?.startsWith('Bearer ')) throw unauthorized();
  try {
    const claims = await verifyAccessToken(authorization.slice(7));
    const row = await one<Row[]>(`SELECT u.id,u.username,u.display_name,u.role,u.status,
      u.must_change_password,u.version,s.id AS session_id
      FROM sessions s JOIN users u ON u.id=s.user_id
      WHERE s.id=? AND s.user_id=? AND s.revoked_at IS NULL AND s.expires_at>UTC_TIMESTAMP(3)
      AND u.deleted_at IS NULL AND u.status='active'`, [claims.sid, claims.sub]);
    if (!row || Number(row.version) !== claims.version) throw unauthorized();
    const user: CurrentUserDto = {
      id: String(row.id), username: String(row.username), displayName: String(row.display_name),
      role: row.role as Role, status: row.status, mustChangePassword: Boolean(row.must_change_password),
      version: Number(row.version),
    };
    c.set('user', user);
    c.set('sessionId', String(row.session_id));
    await next();
  } catch (error) {
    if (error instanceof Error && 'status' in error) throw error;
    throw unauthorized();
  }
};

export function requireRole(...roles: Role[]): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    if (!roles.includes(c.get('user').role)) throw forbidden();
    await next();
  };
}

export function canManage(role: Role): boolean {
  return role === 'director' || role === 'supervisor';
}
