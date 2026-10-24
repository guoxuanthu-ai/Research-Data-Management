import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ProcessStructure, TemplateDto } from '@rds/shared';
import { api, databaseAvailable, login, setup, stop } from './testUtils.js';

function stage(process: ProcessStructure, values: Record<string, string>) {
  return {
    stageKey: process.name === '粉料' ? 'powder' : `custom:${process.id}`,
    values: Object.entries(values).map(([name, value]) => ({
      fieldId: process.fields.find((field) => field.name === name)!.id,
      value,
    })),
  };
}

describe.skipIf(!databaseAvailable)('custom lifecycle stages API (real MySQL)', () => {
  beforeAll(setup);
  afterAll(stop);

  it('supports arbitrary template processes and Excel round trips without pressing or heat treatment', async () => {
    const director = await login('director', 'Admin@123456');
    const templateResponse = await api('/api/v1/templates', director.accessToken, {
      method: 'POST',
      headers: { 'idempotency-key': randomUUID() },
      body: JSON.stringify({
        name: `粉料检测模板-${randomUUID()}`,
        description: '任意工序生命周期集成测试',
        processes: [
          {
            id: randomUUID(),
            processDefId: '00000000-0000-4000-8000-000000000101',
            name: '粉料',
            sortOrder: 10,
            fields: [{ id: randomUUID(), name: '粉料配比', unit: '', valueType: 'text', required: true, minValue: null, maxValue: null, sortOrder: 10 }],
          },
          {
            id: randomUUID(),
            processDefId: null,
            name: '检测',
            sortOrder: 20,
            fields: [{ id: randomUUID(), name: '检测结果', unit: '', valueType: 'text', required: true, minValue: null, maxValue: null, sortOrder: 10 }],
          },
        ],
      }),
    });
    expect(templateResponse.status).toBe(201);
    const template = (await templateResponse.json()).data as TemplateDto;
    const powder = template.processes.find((process) => process.name === '粉料')!;
    const inspection = template.processes.find((process) => process.name === '检测')!;
    const customStageKey = `custom:${inspection.id}`;

    const subjectResponse = await api('/api/v1/experiments', director.accessToken, {
      method: 'POST',
      headers: { 'idempotency-key': randomUUID() },
      body: JSON.stringify({
        name: `粉料检测实验-${randomUUID()}`,
        purpose: '无压制和热处理工序',
        ownerId: director.user.id,
        templateId: template.id,
        date: '2026-10-24',
        remark: '',
      }),
    });
    expect(subjectResponse.status).toBe(201);
    const subject = (await subjectResponse.json()).data;

    const firstResponse = await api('/api/v1/lifecycle-records', director.accessToken, {
      method: 'POST',
      headers: { 'idempotency-key': randomUUID() },
      body: JSON.stringify({
        subjectType: 'experiment',
        subjectId: subject.id,
        stages: [stage(powder, { 粉料配比: 'Cu:Fe=1:1' }), stage(inspection, { 检测结果: '合格' })],
      }),
    });
    expect(firstResponse.status).toBe(201);
    const first = (await firstResponse.json()).data;
    expect(Object.keys(first.stages).sort()).toEqual([customStageKey, 'powder'].sort());
    expect(first.stages[customStageKey].values[0].value).toBe('合格');

    const secondResponse = await api('/api/v1/lifecycle-records', director.accessToken, {
      method: 'POST',
      headers: { 'idempotency-key': randomUUID() },
      body: JSON.stringify({
        subjectType: 'experiment',
        subjectId: subject.id,
        stages: [stage(powder, { 粉料配比: 'Cu:Fe=1:2' })],
      }),
    });
    expect(secondResponse.status).toBe(201);
    const second = (await secondResponse.json()).data;
    const supplementedResponse = await api(`/api/v1/lifecycle-records/${second.id}`, director.accessToken, {
      method: 'PATCH',
      body: JSON.stringify({
        subjectType: 'experiment',
        subjectId: subject.id,
        version: second.version,
        stages: [stage(inspection, { 检测结果: '复测合格' })],
      }),
    });
    expect(supplementedResponse.status).toBe(200);
    const supplemented = (await supplementedResponse.json()).data;
    expect(supplemented.stages[customStageKey].values[0].value).toBe('复测合格');
    expect(supplemented.stages.powder.values[0].value).toBe('Cu:Fe=1:2');

    const forgedResponse = await api(`/api/v1/lifecycle-records/${second.id}`, director.accessToken, {
      method: 'PATCH',
      body: JSON.stringify({
        subjectType: 'experiment',
        subjectId: subject.id,
        version: supplemented.version,
        stages: [{ stageKey: `custom:${randomUUID()}`, values: [{ fieldId: inspection.fields[0]!.id, value: '伪造' }] }],
      }),
    });
    expect(forgedResponse.status).toBe(400);

    const exported = await api(`/api/v1/experiments/${subject.id}/export`, director.accessToken);
    expect(exported.status).toBe(200);
    const form = new FormData();
    form.set('file', new File([await exported.arrayBuffer()], 'custom-roundtrip.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }));
    const previewResponse = await api('/api/v1/experiments/import/preview', director.accessToken, { method: 'POST', body: form });
    expect(previewResponse.status).toBe(201);
    const preview = (await previewResponse.json()).data;
    expect(preview.rows.filter((row: { status: string }) => row.status === 'error')).toEqual([]);
    const inspectionRows = preview.rows.filter((row: { processName: string }) => row.processName === '检测');
    expect(inspectionRows).toHaveLength(2);
    expect(inspectionRows.every((row: { payload: { stageKey: string } }) => row.payload.stageKey === customStageKey)).toBe(true);

    const confirmedResponse = await api(`/api/v1/import-jobs/${preview.jobId}/confirm`, director.accessToken, {
      method: 'POST',
      headers: { 'idempotency-key': randomUUID() },
      body: JSON.stringify({ mode: 'overwrite' }),
    });
    expect(confirmedResponse.status).toBe(200);
    expect((await confirmedResponse.json()).data).toMatchObject({ importedRecords: 2, importedStages: 4 });
    const detail = (await (await api(`/api/v1/experiments/${subject.id}`, director.accessToken)).json()).data;
    expect(detail.lifecycles).toHaveLength(2);
    expect(detail.lifecycles.every((lifecycle: { stages: Record<string, unknown> }) => Object.keys(lifecycle.stages).sort().join(',') === [customStageKey, 'powder'].sort().join(','))).toBe(true);
    expect(detail.lifecycles.map((lifecycle: any) => lifecycle.stages[customStageKey].values[0].value).sort()).toEqual(['复测合格', '合格'].sort());

    const removedDefault = await api(`/api/v1/templates/${template.id}`, director.accessToken, { method: 'PATCH', body: JSON.stringify({
      name: template.name, description: template.description, version: template.version,
      processes: [{ ...inspection, sortOrder: 10 }],
    }) });
    expect(removedDefault.status).toBe(200);
    const afterRemoval = (await (await api(`/api/v1/experiments/${subject.id}`, director.accessToken)).json()).data;
    expect(afterRemoval.template.processes).toHaveLength(1);
    expect(afterRemoval.lifecycles.every((lifecycle: any) => !lifecycle.stages.powder && lifecycle.stages[customStageKey].values.length > 0)).toBe(true);
    const customOnly = await api('/api/v1/lifecycle-records', director.accessToken, { method: 'POST', headers: { 'idempotency-key': randomUUID() },
      body: JSON.stringify({ subjectType: 'experiment', subjectId: subject.id, stages: [stage(inspection, { 检测结果: '仅检测工序' })] }) });
    expect(customOnly.status).toBe(201);
  });
});
