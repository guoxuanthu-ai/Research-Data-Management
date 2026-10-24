import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, databaseAvailable, DEMO_TEMPLATE_ID, login, setup, stop } from './testUtils.js';

function stage(template: any, name: string, values: Record<string, string>) {
  const process = template.processes.find((item: any) => item.name === name);
  return { stageKey: name === '粉料' ? 'powder' : name === '压制' ? 'pressing' : 'heat_treatment',
    values: Object.entries(values).map(([fieldName, value]) => ({ fieldId: process.fields.find((field: any) => field.name === fieldName).id, value })) };
}

describe.skipIf(!databaseAvailable)('lifecycle record API (real MySQL)', () => {
  beforeAll(setup);
  afterAll(stop);

  it('saves stages atomically, supports later entry, sequences numbers and enforces fixed templates and versions', async () => {
    const director = await login('director', 'Admin@123456');
    const templateResponse = await api(`/api/v1/templates/${DEMO_TEMPLATE_ID}`, director.accessToken);
    const template = (await templateResponse.json()).data;
    const created = await api('/api/v1/experiments', director.accessToken, { method: 'POST',
      headers: { 'idempotency-key': randomUUID() }, body: JSON.stringify({ name: `生命周期-${randomUUID()}`, purpose: 'API 集成测试',
        ownerId: director.user.id, templateId: DEMO_TEMPLATE_ID, date: '2026-10-24', remark: '' }) });
    expect(created.status).toBe(201);
    const experiment = (await created.json()).data;
    expect(experiment.templateId).toBe(DEMO_TEMPLATE_ID);

    const threeStages = [stage(template, '粉料', { 粉料粒度: '10', 粉料配比: 'Cu:Fe=1:1' }),
      stage(template, '压制', { 压制压力: '200' }), stage(template, '热处理', { 烧结温度曲线: '25℃→980℃→自然冷却' })];
    const firstResponse = await api('/api/v1/lifecycle-records', director.accessToken, { method: 'POST',
      headers: { 'idempotency-key': randomUUID() }, body: JSON.stringify({ subjectType: 'experiment', subjectId: experiment.id, stages: threeStages }) });
    expect(firstResponse.status).toBe(201);
    const first = (await firstResponse.json()).data;
    expect(first.recordNo).toBe(1);
    expect(Object.keys(first.stages).sort()).toEqual(['heat_treatment', 'powder', 'pressing']);
    expect(first.stages.powder.fields.every((field: any) => template.processes.find((process: any) => process.name === '粉料').fields.some((item: any) => item.id === field.id))).toBe(true);

    const powderOnly = [stage(template, '粉料', { 粉料粒度: '12', 粉料配比: 'Cu:Fe=1:2' })];
    const secondResponse = await api('/api/v1/lifecycle-records', director.accessToken, { method: 'POST',
      headers: { 'idempotency-key': randomUUID() }, body: JSON.stringify({ subjectType: 'experiment', subjectId: experiment.id, stages: powderOnly }) });
    expect(secondResponse.status).toBe(201);
    const second = (await secondResponse.json()).data;
    expect(second.recordNo).toBe(2);
    expect(second.stages.pressing).toBeUndefined();

    const failedCreate = await api('/api/v1/lifecycle-records', director.accessToken, { method: 'POST',
      headers: { 'idempotency-key': randomUUID() }, body: JSON.stringify({ subjectType: 'experiment', subjectId: experiment.id,
        stages: [stage(template, '粉料', { 粉料粒度: '14', 粉料配比: 'rollback' }), stage(template, '压制', { 压制压力: 'not-a-number' })] }) });
    expect(failedCreate.status).toBe(400);
    const thirdResponse = await api('/api/v1/lifecycle-records', director.accessToken, { method: 'POST',
      headers: { 'idempotency-key': randomUUID() }, body: JSON.stringify({ subjectType: 'experiment', subjectId: experiment.id,
        stages: [stage(template, '粉料', { 粉料粒度: '16', 粉料配比: 'after-rollback' })] }) });
    expect(thirdResponse.status).toBe(201);
    expect((await thirdResponse.json()).data.recordNo).toBe(3);

    const supplementedBody = { subjectType: 'experiment', subjectId: experiment.id, version: second.version,
      stages: [...powderOnly, stage(template, '压制', { 压制压力: '220' })] };
    const supplementedResponse = await api(`/api/v1/lifecycle-records/${second.id}`, director.accessToken, { method: 'PATCH', body: JSON.stringify(supplementedBody) });
    expect(supplementedResponse.status).toBe(200);
    const supplemented = (await supplementedResponse.json()).data;
    expect(supplemented.stages.pressing.values[0].value).toBe('220');
    expect(supplemented.version).toBe(2);
    expect((await api(`/api/v1/lifecycle-records/${second.id}`, director.accessToken, { method: 'PATCH', body: JSON.stringify(supplementedBody) })).status).toBe(409);

    const forged = await api(`/api/v1/lifecycle-records/${second.id}`, director.accessToken, { method: 'PATCH', body: JSON.stringify({
      subjectType: 'experiment', subjectId: experiment.id, version: 2, stages: [{ stageKey: 'heat_treatment', values: [{ fieldId: randomUUID(), value: ' forged ' }] }] }) });
    expect(forged.status).toBe(400);
    const failedUpdate = await api(`/api/v1/lifecycle-records/${second.id}`, director.accessToken, { method: 'PATCH', body: JSON.stringify({
      subjectType: 'experiment', subjectId: experiment.id, version: 2,
      stages: [stage(template, '粉料', { 粉料粒度: '12', 粉料配比: 'SHOULD-ROLLBACK' }), stage(template, '压制', { 压制压力: 'bad' })] }) });
    expect(failedUpdate.status).toBe(400);
    const afterFailure = await (await api(`/api/v1/lifecycle-records/${second.id}`, director.accessToken)).json();
    expect(afterFailure.data.version).toBe(2);
    expect(afterFailure.data.stages.powder.values.find((value: any) => value.fieldId === powderOnly[0]!.values[1]!.fieldId).value).toBe('Cu:Fe=1:2');

    const detail = await (await api(`/api/v1/experiments/${experiment.id}`, director.accessToken)).json();
    expect(detail.data.recordCount).toBe(3);
    expect(detail.data.lifecycles).toHaveLength(3);
    expect(detail.data.template.id).toBe(DEMO_TEMPLATE_ID);
    expect(detail.data.records).toHaveLength(6);

    const deleted = await api(`/api/v1/lifecycle-records/${second.id}`, director.accessToken, { method: 'DELETE', body: JSON.stringify({ version: 2 }) });
    expect(deleted.status).toBe(200);
    const restored = await api(`/api/v1/lifecycle-records/${second.id}/restore`, director.accessToken, { method: 'POST', body: JSON.stringify({ version: 3 }) });
    expect(restored.status).toBe(200);
    const history = await api(`/api/v1/lifecycle-records/${second.id}/history`, director.accessToken);
    expect((await history.json()).data.length).toBeGreaterThanOrEqual(3);
    expect((await api('/api/v1/records', director.accessToken, { method: 'POST', headers: { 'idempotency-key': randomUUID() }, body: '{}' })).status).toBe(410);
  });
});
