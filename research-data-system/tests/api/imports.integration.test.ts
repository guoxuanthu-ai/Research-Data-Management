import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, databaseAvailable, DEMO_TEMPLATE_ID, login, setup, stop } from './testUtils.js';

function stages(template: any, curve: string, ratio: string, pressure: string) {
  const values = (processName: string, entries: Record<string, string>) => {
    const process = template.processes.find((item: any) => item.name === processName);
    return Object.entries(entries).map(([name, value]) => ({ fieldId: process.fields.find((field: any) => field.name === name).id, value }));
  };
  return [{ stageKey: 'powder', values: values('粉料', { 粉料粒度: '10', 粉料配比: ratio }) },
    { stageKey: 'pressing', values: values('压制', { 压制压力: pressure }) },
    { stageKey: 'heat_treatment', values: values('热处理', { 烧结温度曲线: curve }) }];
}

describe.skipIf(!databaseAvailable)('Excel lifecycle API (real MySQL)', () => {
  beforeAll(setup);
  afterAll(stop);

  it('round-trips three sheets as the same lifecycle without losing values during overwrite', async () => {
    const director = await login('director', 'Admin@123456');
    const template = (await (await api(`/api/v1/templates/${DEMO_TEMPLATE_ID}`, director.accessToken)).json()).data;
    const templateFile = await api('/api/v1/experiments/import/template', director.accessToken);
    expect(templateFile.status).toBe(200);
    expect(new Uint8Array(await templateFile.arrayBuffer()).slice(0, 2)).toEqual(new Uint8Array([0x50, 0x4b]));
    const created = await api('/api/v1/experiments', director.accessToken, { method: 'POST', headers: { 'idempotency-key': randomUUID() },
      body: JSON.stringify({ name: `Excel生命周期-${randomUUID()}`, purpose: '三 Sheet 往返', ownerId: director.user.id,
        templateId: DEMO_TEMPLATE_ID, date: '2026-10-24', remark: '' }) });
    expect(created.status).toBe(201);
    const experiment = (await created.json()).data;
    const curves = ['25℃→780℃/2h→980℃/1h→自然冷却', '30℃→800℃/1h→1000℃/2h→随炉冷却'];
    const lifecycleIds: string[] = [];
    for (const [index, curve] of curves.entries()) {
      const record = await api('/api/v1/lifecycle-records', director.accessToken, { method: 'POST', headers: { 'idempotency-key': randomUUID() },
        body: JSON.stringify({ subjectType: 'experiment', subjectId: experiment.id, stages: stages(template, curve, `ratio-${index}`, String(200 + index)) }) });
      expect(record.status).toBe(201);
      lifecycleIds.push((await record.json()).data.id);
    }
    const exported = await api(`/api/v1/experiments/${experiment.id}/export`, director.accessToken);
    expect(exported.status).toBe(200);
    const buffer = await exported.arrayBuffer();
    expect(new Uint8Array(buffer).slice(0, 2)).toEqual(new Uint8Array([0x50, 0x4b]));
    const form = new FormData();
    form.set('file', new File([buffer], 'roundtrip.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const preview = await api('/api/v1/experiments/import/preview', director.accessToken, { method: 'POST', body: form });
    expect(preview.status).toBe(201);
    const job = (await preview.json()).data;
    expect(job.rows.filter((row: { status: string }) => row.status === 'error')).toEqual([]);
    const stageRows = job.rows.filter((row: { processName: string }) => row.processName);
    expect(stageRows).toHaveLength(6);
    expect(stageRows.filter((row: any) => row.processName === '热处理').map((row: any) => row.payload.lifecycleId).sort()).toEqual([...lifecycleIds].sort());
    expect(stageRows.filter((row: any) => row.processName === '热处理').map((row: any) => row.payload.values[0]?.value).sort()).toEqual([...curves].sort());
    const confirmed = await api(`/api/v1/import-jobs/${job.jobId}/confirm`, director.accessToken, { method: 'POST',
      headers: { 'idempotency-key': randomUUID() }, body: JSON.stringify({ mode: 'overwrite' }) });
    expect(confirmed.status).toBe(200);
    expect((await confirmed.json()).data).toMatchObject({ importedRecords: 2, importedStages: 6 });
    const detail = await api(`/api/v1/experiments/${experiment.id}`, director.accessToken);
    const lifecycles = (await detail.json()).data.lifecycles;
    expect(lifecycles).toHaveLength(2);
    expect(lifecycles.map((lifecycle: any) => lifecycle.id).sort()).toEqual([...lifecycleIds].sort());
    expect(lifecycles.every((lifecycle: any) => Object.keys(lifecycle.stages).length === 3)).toBe(true);
    expect(lifecycles.map((lifecycle: any) => lifecycle.stages.heat_treatment.values[0]?.value).sort()).toEqual([...curves].sort());
  });
});
