import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, databaseAvailable, DEMO_EXPERIMENT_ID, DEMO_TEMPLATE_ID, login, setup, stop } from './testUtils.js';

describe.skipIf(!databaseAvailable)('management API contracts (real MySQL)', () => {
  beforeAll(setup);
  afterAll(stop);

  it('supports the complete user lifecycle and status filtering', async () => {
    const director = await login('director', 'Admin@123456');
    const username = `qa_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
    const created = await api('/api/v1/users', director.accessToken, { method: 'POST', headers: { 'idempotency-key': randomUUID() },
      body: JSON.stringify({ username, displayName: 'QA 用户', role: 'engineer', initialPassword: 'QaInitial@123' }) });
    expect(created.status).toBe(201);
    const user = (await created.json()).data;
    expect(user.initialPassword).toBe('QaInitial@123');

    const updatedResponse = await api(`/api/v1/users/${user.id}`, director.accessToken, { method: 'PATCH',
      body: JSON.stringify({ displayName: 'QA 主管', role: 'supervisor', version: user.version }) });
    expect(updatedResponse.status).toBe(200);
    const updated = (await updatedResponse.json()).data;
    expect(updated.role).toBe('supervisor');

    const disabledResponse = await api(`/api/v1/users/${user.id}/status`, director.accessToken, { method: 'POST',
      body: JSON.stringify({ status: 'disabled', version: updated.version }) });
    expect(disabledResponse.status).toBe(200);
    const disabled = (await disabledResponse.json()).data;
    const filtered = await api('/api/v1/users?status=disabled', director.accessToken);
    expect(filtered.status).toBe(200);
    const disabledPage = (await filtered.json()).data;
    expect(disabledPage.items.some((item: { id: string }) => item.id === user.id)).toBe(true);
    expect(disabledPage.items.every((item: { status: string }) => item.status === 'disabled')).toBe(true);

    const enabledResponse = await api(`/api/v1/users/${user.id}/status`, director.accessToken, { method: 'POST',
      body: JSON.stringify({ status: 'active', version: disabled.version }) });
    const enabled = (await enabledResponse.json()).data;
    expect(enabled.status).toBe('active');
    const reset = await api(`/api/v1/users/${user.id}/reset-password`, director.accessToken, { method: 'POST', body: '{}' });
    expect(reset.status).toBe(200);
    const resetBody = (await reset.json()).data;
    expect(resetBody.initialPassword.length).toBeGreaterThanOrEqual(10);
    const resetLogin = await login(username, resetBody.initialPassword);
    expect(resetLogin.response.status).toBe(200);

    const deleted = await api(`/api/v1/users/${user.id}`, director.accessToken, { method: 'DELETE', body: JSON.stringify({ version: enabled.version + 1 }) });
    expect(deleted.status).toBe(200);
  });

  it('generates unique product codes when the Web omits an empty optional code', async () => {
    const director = await login('director', 'Admin@123456');
    const codes: string[] = [];
    for (let index = 0; index < 2; index += 1) {
      const response = await api('/api/v1/products', director.accessToken, { method: 'POST', headers: { 'idempotency-key': randomUUID() },
        body: JSON.stringify({ name: `空型号产品-${randomUUID()}`, purpose: '', ownerId: director.user.id, templateId: DEMO_TEMPLATE_ID, remark: '' }) });
      expect(response.status).toBe(201);
      const product = (await response.json()).data;
      expect(product.code).toMatch(/^PRD-[A-F0-9]{8}$/);
      codes.push(product.code);
    }
    expect(new Set(codes).size).toBe(2);
  });

  it('edits, disables and enables a fixed three-stage template', async () => {
    const director = await login('director', 'Admin@123456');
    const curveId = randomUUID();
    const structure = [
      { id: randomUUID(), processDefId: '00000000-0000-4000-8000-000000000101', name: '粉料', sortOrder: 10,
        fields: [{ id: randomUUID(), name: '粉料粒度', unit: 'μm', valueType: 'number', required: true, minValue: 0, maxValue: null, sortOrder: 0 }] },
      { id: randomUUID(), processDefId: '00000000-0000-4000-8000-000000000102', name: '压制', sortOrder: 20,
        fields: [{ id: randomUUID(), name: '压制压力', unit: 'MPa', valueType: 'number', required: true, minValue: 0, maxValue: null, sortOrder: 0 }] },
      { id: randomUUID(), processDefId: '00000000-0000-4000-8000-000000000103', name: '热处理', sortOrder: 30,
        fields: [{ id: curveId, name: '烧结温度曲线', unit: '', valueType: 'text', required: true, minValue: null, maxValue: null, sortOrder: 0 }] },
    ];
    const created = await api('/api/v1/templates', director.accessToken, { method: 'POST', headers: { 'idempotency-key': randomUUID() },
      body: JSON.stringify({ name: `QA模板-${randomUUID()}`, description: '契约测试', processes: structure }) });
    expect(created.status).toBe(201);
    const template = (await created.json()).data;
    const edited = await api(`/api/v1/templates/${template.id}`, director.accessToken, { method: 'PATCH', body: JSON.stringify({
      name: template.name, description: '已编辑', version: template.version,
      processes: [...structure.slice(0, 2), { ...structure[2], fields: [...structure[2]!.fields, { id: randomUUID(), name: 'Q 值', unit: '', valueType: 'number', required: false, minValue: 0, maxValue: null, sortOrder: 10 }] }],
    }) });
    expect(edited.status).toBe(200);
    const editedBody = (await edited.json()).data;
    expect(editedBody.processes[2].fields).toHaveLength(2);
    const disabled = await api(`/api/v1/templates/${template.id}/status`, director.accessToken, { method: 'POST', body: JSON.stringify({ status: 'disabled', version: editedBody.version }) });
    expect(disabled.status).toBe(200);
    const disabledBody = (await disabled.json()).data;
    const enabled = await api(`/api/v1/templates/${template.id}/status`, director.accessToken, { method: 'POST', body: JSON.stringify({ status: 'active', version: disabledBody.version }) });
    expect(enabled.status).toBe(200);
  });

  it('synchronizes stable field additions, edits and deletion to history and rejects incompatible type changes', async () => {
    const director = await login('director', 'Admin@123456');
    const field = (name: string, valueType = 'number') => ({ id: randomUUID(), name, unit: '', valueType, required: false, minValue: null, maxValue: null, sortOrder: 0 });
    const size = field('粒度');
    const obsolete = field('待删除', 'text');
    const pressure = field('压力');
    const curve = field('曲线', 'text');
    const process = (name: string, processDefId: string, fields: any[]) => ({ id: randomUUID(), processDefId, name, sortOrder: 0, fields });
    const processes = [process('粉料', '00000000-0000-4000-8000-000000000101', [size, obsolete]),
      process('压制', '00000000-0000-4000-8000-000000000102', [pressure]), process('热处理', '00000000-0000-4000-8000-000000000103', [curve])];
    const createdTemplate = await api('/api/v1/templates', director.accessToken, { method: 'POST', headers: { 'idempotency-key': randomUUID() },
      body: JSON.stringify({ name: `同步模板-${randomUUID()}`, description: '', processes }) });
    expect(createdTemplate.status).toBe(201);
    const template = (await createdTemplate.json()).data;
    const createdSubject = await api('/api/v1/experiments', director.accessToken, { method: 'POST', headers: { 'idempotency-key': randomUUID() },
      body: JSON.stringify({ name: `结构同步-${randomUUID()}`, purpose: '', ownerId: director.user.id, templateId: template.id, date: '2026-10-24', remark: '' }) });
    const subject = (await createdSubject.json()).data;
    const createdRecord = await api('/api/v1/lifecycle-records', director.accessToken, { method: 'POST', headers: { 'idempotency-key': randomUUID() },
      body: JSON.stringify({ subjectType: 'experiment', subjectId: subject.id, stages: [{ stageKey: 'powder', values: [{ fieldId: size.id, value: '12.5' }] }] }) });
    expect(createdRecord.status).toBe(201);
    const lifecycle = (await createdRecord.json()).data;
    const note = field('备注', 'text');
    const firstPatch = await api(`/api/v1/templates/${template.id}`, director.accessToken, { method: 'PATCH', body: JSON.stringify({
      name: template.name, description: '', version: template.version,
      processes: [{ ...processes[0], fields: [{ ...size, name: '粒度修订' }, note] }, processes[1], processes[2]] }) });
    expect(firstPatch.status).toBe(200);
    const synced = await (await api(`/api/v1/lifecycle-records/${lifecycle.id}`, director.accessToken)).json();
    expect(synced.data.stages.powder.fields.map((item: any) => item.id)).toEqual([size.id, note.id]);
    expect(synced.data.stages.powder.fields[0].name).toBe('粒度修订');
    expect(synced.data.stages.powder.values).toEqual([{ fieldId: size.id, value: '12.5' }]);

    const toText = await api(`/api/v1/templates/${template.id}`, director.accessToken, { method: 'PATCH', body: JSON.stringify({
      name: template.name, description: '', version: template.version + 1,
      processes: [{ ...processes[0], fields: [{ ...size, name: '粒度修订', valueType: 'text' }, note] }, processes[1], processes[2]] }) });
    expect(toText.status).toBe(200);
    const textValue = await api(`/api/v1/lifecycle-records/${lifecycle.id}`, director.accessToken, { method: 'PATCH', body: JSON.stringify({
      subjectType: 'experiment', subjectId: subject.id, version: lifecycle.version, stages: [{ stageKey: 'powder', values: [{ fieldId: size.id, value: 'not-numeric' }] }] }) });
    expect(textValue.status).toBe(200);
    const incompatible = await api(`/api/v1/templates/${template.id}`, director.accessToken, { method: 'PATCH', body: JSON.stringify({
      name: template.name, description: '', version: template.version + 2,
      processes: [{ ...processes[0], fields: [{ ...size, name: '粒度修订' }, note] }, processes[1], processes[2]] }) });
    expect(incompatible.status).toBe(400);
    const current = await (await api(`/api/v1/lifecycle-records/${lifecycle.id}`, director.accessToken)).json();
    expect(current.data.stages.powder.fields[0].valueType).toBe('text');
    expect(current.data.stages.powder.values[0].value).toBe('not-numeric');
  });
});
