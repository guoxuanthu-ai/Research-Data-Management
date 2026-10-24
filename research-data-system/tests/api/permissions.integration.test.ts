import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, databaseAvailable, login, setup, stop } from './testUtils.js';

describe.skipIf(!databaseAvailable)('permissions API (real MySQL)', () => {
  beforeAll(setup);
  afterAll(stop);

  it('blocks engineers from managing others and supervisors from managing directors', async () => {
    const director = await login('director', 'Admin@123456');
    const engineer = await login('engineer', 'Engineer@123456');
    const created = await api('/api/v1/products', director.accessToken, { method: 'POST', headers: { 'idempotency-key': randomUUID() },
      body: JSON.stringify({ code: `TEST-${randomUUID()}`, name: '权限测试产品', ownerId: director.user.id, purpose: '', remark: '', templateId: '00000000-0000-4000-8000-000000000201' }) });
    expect(created.status).toBe(201);
    const product = (await created.json()).data;
    const denied = await api(`/api/v1/products/${product.id}`, engineer.accessToken, { method: 'PATCH', body: JSON.stringify({
      code: product.code, name: product.name, purpose: '', ownerId: director.user.id, remark: '', version: product.version, templateId: product.templateId,
    }) });
    expect(denied.status).toBe(403);
    const deniedDelete = await api(`/api/v1/products/${product.id}`, engineer.accessToken, { method: 'DELETE', body: JSON.stringify({ version: product.version }) });
    expect(deniedDelete.status).toBe(403);
    const deniedAudit = await api('/api/v1/audit-logs', engineer.accessToken);
    expect(deniedAudit.status).toBe(403);
    const supervisor = await login('supervisor', 'Supervisor@123456');
    const deniedUser = await api('/api/v1/users', supervisor.accessToken, { method: 'POST', headers: { 'idempotency-key': randomUUID() },
      body: JSON.stringify({ username: `bad${Date.now()}`, displayName: '越权账号', role: 'director', initialPassword: 'Forbidden@123' }) });
    expect(deniedUser.status).toBe(403);
  });

  it('allows directors and supervisors to delete only unused templates', async () => {
    const director = await login('director', 'Admin@123456');
    const supervisor = await login('supervisor', 'Supervisor@123456');
    const engineer = await login('engineer', 'Engineer@123456');
    const createTemplate = async () => {
      const response = await api('/api/v1/templates', director.accessToken, { method: 'POST', headers: { 'idempotency-key': randomUUID() },
        body: JSON.stringify({ name: `未使用模板-${randomUUID()}`, description: '', processes: [{ id: randomUUID(), processDefId: null, name: '检测', sortOrder: 10,
          fields: [{ id: randomUUID(), name: '检测结果', unit: '', valueType: 'text', required: false, minValue: null, maxValue: null, sortOrder: 10 }] }] }) });
      expect(response.status).toBe(201);
      return (await response.json()).data;
    };
    const engineerTarget = await createTemplate();
    expect((await api(`/api/v1/templates/${engineerTarget.id}`, engineer.accessToken, { method: 'DELETE', body: JSON.stringify({ version: engineerTarget.version }) })).status).toBe(403);
    expect((await api(`/api/v1/templates/${engineerTarget.id}`, director.accessToken, { method: 'DELETE', body: JSON.stringify({ version: engineerTarget.version }) })).status).toBe(200);
    const directorTarget = await createTemplate();
    expect((await api(`/api/v1/templates/${directorTarget.id}`, director.accessToken, { method: 'DELETE', body: JSON.stringify({ version: directorTarget.version }) })).status).toBe(200);
    expect((await api(`/api/v1/templates/${directorTarget.id}`, director.accessToken)).status).toBe(404);
    const supervisorTarget = await createTemplate();
    expect((await api(`/api/v1/templates/${supervisorTarget.id}`, supervisor.accessToken, { method: 'DELETE', body: JSON.stringify({ version: supervisorTarget.version }) })).status).toBe(200);

    const used = await api('/api/v1/templates/00000000-0000-4000-8000-000000000201', director.accessToken);
    const usedTemplate = (await used.json()).data;
    const rejected = await api(`/api/v1/templates/${usedTemplate.id}`, director.accessToken, { method: 'DELETE', body: JSON.stringify({ version: usedTemplate.version }) });
    expect(rejected.status).toBe(409);
    const demo = await api('/api/v1/experiments/00000000-0000-4000-8000-000000000302', director.accessToken);
    expect(demo.status).toBe(200);
    expect((await demo.json()).data.lifecycles.length).toBeGreaterThan(0);

    const linked = await createTemplate();
    const productResponse = await api('/api/v1/products', director.accessToken, { method: 'POST', headers: { 'idempotency-key': randomUUID() },
      body: JSON.stringify({ code: `DELETE-TEMPLATE-${randomUUID()}`, name: '删除主体释放模板', ownerId: director.user.id, remark: '', templateId: linked.id }) });
    expect(productResponse.status).toBe(201);
    const product = (await productResponse.json()).data;
    expect((await api(`/api/v1/products/${product.id}`, director.accessToken, { method: 'DELETE', body: JSON.stringify({ version: product.version }) })).status).toBe(200);
    expect((await api(`/api/v1/templates/${linked.id}`, director.accessToken, { method: 'DELETE', body: JSON.stringify({ version: linked.version }) })).status).toBe(200);
    expect((await api(`/api/v1/templates/${linked.id}`, director.accessToken)).status).toBe(404);
    const restored = await api(`/api/v1/products/${product.id}/restore`, director.accessToken, { method: 'POST', body: JSON.stringify({ version: product.version + 1 }) });
    expect(restored.status).toBe(200);
    expect((await api(`/api/v1/templates/${linked.id}`, director.accessToken)).status).toBe(200);
    expect((await api(`/api/v1/products/${product.id}`, director.accessToken)).status).toBe(200);
  });

  it('allows directors to batch permanently delete unique audit logs without adding more', async () => {
    const director = await login('director', 'Admin@123456');
    const supervisor = await login('supervisor', 'Supervisor@123456');
    const engineer = await login('engineer', 'Engineer@123456');
    const createAudit = async () => {
      const created = await api('/api/v1/users', director.accessToken, { method: 'POST', headers: { 'idempotency-key': randomUUID() },
        body: JSON.stringify({ username: `audit_${randomUUID().replaceAll('-', '').slice(0, 12)}`, displayName: '批量审计删除测试', role: 'engineer', initialPassword: 'AuditInitial@123' }) });
      expect(created.status).toBe(201);
      const user = (await created.json()).data;
      const response = await api(`/api/v1/audit-logs?entityType=user&entityId=${user.id}`, director.accessToken);
      expect(response.status).toBe(200);
      const page = (await response.json()).data;
      expect(page.total).toBe(1);
      return { userId: user.id as string, auditId: page.items[0].id as string };
    };
    const first = await createAudit();
    const second = await createAudit();
    const retained = await createAudit();
    const ids = [first.auditId, second.auditId, first.auditId];
    const request = (accessToken: string, body: unknown) => api('/api/v1/audit-logs/batch-delete', accessToken, { method: 'POST', body: JSON.stringify(body) });

    expect((await request(supervisor.accessToken, { ids })).status).toBe(403);
    expect((await request(engineer.accessToken, { ids })).status).toBe(403);
    expect((await request(director.accessToken, { ids: [] })).status).toBe(400);
    const before = await api('/api/v1/audit-logs?pageSize=1', director.accessToken);
    expect(before.status).toBe(200);
    const beforeTotal = (await before.json()).data.total as number;

    const deleted = await request(director.accessToken, { ids });
    expect(deleted.status).toBe(200);
    expect((await deleted.json()).data.deletedCount).toBe(2);

    const after = await api('/api/v1/audit-logs?pageSize=1', director.accessToken);
    expect(after.status).toBe(200);
    expect((await after.json()).data.total).toBe(beforeTotal - 2);
    for (const target of [first, second]) {
      const response = await api(`/api/v1/audit-logs?entityType=user&entityId=${target.userId}`, director.accessToken);
      expect((await response.json()).data.total).toBe(0);
    }
    const retainedResponse = await api(`/api/v1/audit-logs?entityType=user&entityId=${retained.userId}`, director.accessToken);
    const retainedPage = (await retainedResponse.json()).data;
    expect(retainedPage.total).toBe(1);
    expect(retainedPage.items[0].id).toBe(retained.auditId);
  });

  it('allows only directors to permanently delete an audit log without adding another', async () => {
    const director = await login('director', 'Admin@123456');
    const supervisor = await login('supervisor', 'Supervisor@123456');
    const engineer = await login('engineer', 'Engineer@123456');
    const created = await api('/api/v1/users', director.accessToken, { method: 'POST', headers: { 'idempotency-key': randomUUID() },
      body: JSON.stringify({ username: `audit_${randomUUID().replaceAll('-', '').slice(0, 12)}`, displayName: '审计删除测试', role: 'engineer', initialPassword: 'AuditInitial@123' }) });
    expect(created.status).toBe(201);
    const user = (await created.json()).data;
    const filter = `entityType=user&entityId=${user.id}`;
    const before = await api(`/api/v1/audit-logs?${filter}`, director.accessToken);
    expect(before.status).toBe(200);
    const beforePage = (await before.json()).data;
    expect(beforePage.total).toBe(1);
    const target = beforePage.items[0];

    expect((await api(`/api/v1/audit-logs/${target.id}`, supervisor.accessToken, { method: 'DELETE' })).status).toBe(403);
    expect((await api(`/api/v1/audit-logs/${target.id}`, engineer.accessToken, { method: 'DELETE' })).status).toBe(403);
    expect((await api(`/api/v1/audit-logs/${target.id}`, director.accessToken, { method: 'DELETE' })).status).toBe(200);

    const after = await api(`/api/v1/audit-logs?${filter}`, director.accessToken);
    expect(after.status).toBe(200);
    expect((await after.json()).data.total).toBe(beforePage.total - 1);
    expect((await api(`/api/v1/audit-logs/${target.id}`, director.accessToken, { method: 'DELETE' })).status).toBe(404);
  });
});
