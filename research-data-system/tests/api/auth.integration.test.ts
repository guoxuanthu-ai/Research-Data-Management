import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, databaseAvailable, getApp, login, setup, stop } from './testUtils.js';

describe.skipIf(!databaseAvailable)('auth API (real MySQL)', () => {
  beforeAll(setup);
  afterAll(stop);

  it('logs in, rotates refresh tokens and keeps independent sessions', async () => {
    const first = await login('director', 'Admin@123456');
    expect(first.accessToken).toBeTruthy();
    const second = await login('director', 'Admin@123456');
    const app = await getApp();
    const refreshed = await app.request('/api/v1/auth/refresh', { method: 'POST', headers: { cookie: first.cookie } });
    expect(refreshed.status).toBe(200);
    const replay = await app.request('/api/v1/auth/refresh', { method: 'POST', headers: { cookie: first.cookie } });
    expect(replay.status).toBe(401);
    const otherSession = await app.request('/api/v1/auth/refresh', { method: 'POST', headers: { cookie: second.cookie } });
    expect(otherSession.status).toBe(200);
    const me = await api('/api/v1/auth/me', first.accessToken);
    expect(me.status).toBe(200);
    expect((await me.json()).data.username).toBe('director');
  });

  it('allows newly created and reset users to log in without changing passwords', async () => {
    const director = await login('director', 'Admin@123456');
    const username = `initial_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
    const created = await api('/api/v1/users', director.accessToken, { method: 'POST', headers: { 'idempotency-key': randomUUID() },
      body: JSON.stringify({ username, displayName: '免强制改密', role: 'engineer', initialPassword: 'Initial@12345' }) });
    expect(created.status).toBe(201);
    const user = (await created.json()).data;
    expect(user.mustChangePassword).toBe(false);

    const initialSession = await login(username, 'Initial@12345');
    expect(initialSession.response.status).toBe(200);
    expect(initialSession.user.mustChangePassword).toBe(false);
    expect((await api('/api/v1/process-defs', initialSession.accessToken)).status).toBe(200);

    const reset = await api(`/api/v1/users/${user.id}/reset-password`, director.accessToken, { method: 'POST', body: '{}' });
    expect(reset.status).toBe(200);
    const resetPassword = (await reset.json()).data.initialPassword;
    const resetSession = await login(username, resetPassword);
    expect(resetSession.response.status).toBe(200);
    expect(resetSession.user.mustChangePassword).toBe(false);
    expect((await api('/api/v1/process-defs', resetSession.accessToken)).status).toBe(200);
  });

  it('requires a new session after password change and accepts the Web re-login sequence', async () => {
    const director = await login('director', 'Admin@123456');
    const username = `pwd_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
    const created = await api('/api/v1/users', director.accessToken, { method: 'POST', headers: { 'idempotency-key': randomUUID() },
      body: JSON.stringify({ username, displayName: '改密回归', role: 'engineer', initialPassword: 'Before@12345' }) });
    const user = (await created.json()).data;
    const session = await login(username, 'Before@12345');
    const changed = await api('/api/v1/auth/change-password', session.accessToken, { method: 'POST',
      body: JSON.stringify({ oldPassword: 'Before@12345', newPassword: 'After@12345' }) });
    expect(changed.status).toBe(200);
    expect((await api('/api/v1/auth/me', session.accessToken)).status).toBe(401);
    const reconnected = await login(username, 'After@12345');
    expect(reconnected.response.status).toBe(200);
    const me = await api('/api/v1/auth/me', reconnected.accessToken);
    expect(me.status).toBe(200);
    expect((await me.json()).data.mustChangePassword).toBe(false);
    const deleted = await api(`/api/v1/users/${user.id}`, director.accessToken, { method: 'DELETE', body: JSON.stringify({ version: user.version + 1 }) });
    expect(deleted.status).toBe(200);
  });
});
