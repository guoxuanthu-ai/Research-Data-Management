import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, databaseAvailable, login, setup, stop } from './testUtils.js';

describe.skipIf(!databaseAvailable)('draft, dashboard and audit contracts (real MySQL)', () => {
  beforeAll(setup);
  afterAll(stop);

  it('preserves the newest cloud draft and rejects stale versions and timestamps', async () => {
    const director = await login('director', 'Admin@123456');
    const created = await api('/api/v1/experiments', director.accessToken, { method: 'POST', headers: { 'idempotency-key': randomUUID() },
      body: JSON.stringify({ name: `草稿实验-${randomUUID()}`, purpose: '草稿冲突', ownerId: director.user.id, date: '2026-10-24', remark: '', templateId: '00000000-0000-4000-8000-000000000201' }) });
    expect(created.status).toBe(201);
    const experiment = (await created.json()).data;
    const draft = { subjectType: 'experiment', subjectId: experiment.id, processName: 'lifecycle/new', payload: { values: { powder: { note: '第一版' } } }, clientUpdatedAt: '2026-10-24T04:00:00.000Z' };
    const first = await api('/api/v1/drafts', director.accessToken, { method: 'POST', body: JSON.stringify(draft) });
    expect(first.status).toBe(200);
    const firstBody = (await first.json()).data;
    const second = await api('/api/v1/drafts', director.accessToken, { method: 'POST', body: JSON.stringify({ ...draft, payload: { values: { powder: { note: '第二版' } } }, clientUpdatedAt: '2026-10-24T05:00:00.000Z', version: firstBody.version }) });
    expect(second.status).toBe(200);
    const secondBody = (await second.json()).data;
    const staleVersion = await api('/api/v1/drafts', director.accessToken, { method: 'POST', body: JSON.stringify({ ...draft, clientUpdatedAt: '2026-10-24T06:00:00.000Z', version: firstBody.version }) });
    expect(staleVersion.status).toBe(409);
    const staleTime = await api('/api/v1/drafts', director.accessToken, { method: 'POST', body: JSON.stringify({ ...draft, version: secondBody.version }) });
    expect(staleTime.status).toBe(409);
    const listed = await api(`/api/v1/drafts?subjectType=experiment&subjectId=${experiment.id}`, director.accessToken);
    const drafts = (await listed.json()).data;
    expect(drafts).toHaveLength(1);
    expect(drafts[0].payload.values.powder.note).toBe('第二版');
  });

  it('returns dashboard DTOs and applies every audit filter used by the Web', async () => {
    const director = await login('director', 'Admin@123456');
    const dashboard = await api('/api/v1/dashboard/summary', director.accessToken);
    expect(dashboard.status).toBe(200);
    const summary = (await dashboard.json()).data;
    expect(summary).toMatchObject({ weekExperiments: expect.any(Number), monthExperiments: expect.any(Number), monthProducts: expect.any(Number), monthRecords: expect.any(Number), totalProducts: expect.any(Number), totalExperiments: expect.any(Number) });
    expect(Array.isArray(summary.activities)).toBe(true);
    expect(Array.isArray(summary.missingEntries)).toBe(true);
    const audits = await api(`/api/v1/audit-logs?actorId=${director.user.id}&action=create&entityType=experiment&dateFrom=2020-01-01&dateTo=2099-12-31&page=1&pageSize=100`, director.accessToken);
    expect(audits.status).toBe(200);
    const page = (await audits.json()).data;
    expect(page.items.length).toBeGreaterThan(0);
    expect(page.items.every((item: { actorId: string; action: string; entityType: string }) => item.actorId === director.user.id && item.action === 'create' && item.entityType === 'experiment')).toBe(true);
  });
});
