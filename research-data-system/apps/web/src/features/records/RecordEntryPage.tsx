import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { DraftDto, SmartAssignment, StageKey, SubjectType } from '@rds/shared';
import { lifecycleApi, miscApi, recordApi, subjectApi } from '../../api';
import { useAuth } from '../../auth/AuthProvider';
import { canManage } from '../../auth/permissions';
import { Button } from '../../components/ui/Button';
import { Badge, ErrorState, Loading, PageHeader } from '../../components/ui/Feedback';
import { Field, Input, Textarea } from '../../components/ui/Form';
import { Icon } from '../../components/ui/Icon';
import { Tabs } from '../../components/ui/Tabs';
import { useToast } from '../../components/ui/Toast';
import { useAsync } from '../../hooks/useAsync';
import { clearLocalDraft, readLocalDraft, writeLocalDraft } from '../../utils/localDraft';
import { fieldInputType, fromTemplate, normalizeValues, processForStage, stageEntries, valuesFromLifecycle, type EntryPayload, type EntryValues } from './recordFormState';

export function RecordEntryPage({ type }: { type: SubjectType }) {
  const { id = '' } = useParams();
  const [searchParams] = useSearchParams();
  const editingId = searchParams.get('lifecycle');
  const navigate = useNavigate(); const { user } = useAuth(); const { toast } = useToast();
  const subjectState = useAsync(() => subjectApi.detail(type, id), [type, id]);
  const editingRecord = subjectState.data?.lifecycles.find((record) => record.id === editingId) ?? null;
  const [initialized, setInitialized] = useState('');
  const [processId, setProcessId] = useState<StageKey>('powder');
  const [values, setValues] = useState<EntryValues>({});
  const [smartText, setSmartText] = useState('');
  const [mode, setMode] = useState<'manual' | 'smart'>('manual');
  const [assignments, setAssignments] = useState<SmartAssignment[]>([]);
  const [unmatched, setUnmatched] = useState<string[]>([]);
  const [parseWarnings, setParseWarnings] = useState<string[]>([]);
  const [parsing, setParsing] = useState(false); const [saving, setSaving] = useState(false); const [dirty, setDirty] = useState(false);
  const [draftStatus, setDraftStatus] = useState('草稿仅在本机保存');
  const [cloudConflict, setCloudConflict] = useState<DraftDto | null>(null);
  const [draftVersion, setDraftVersion] = useState<number>();
  const processes = useMemo(() => subjectState.data ? fromTemplate(subjectState.data.template) : [], [subjectState.data]);
  const availableStages = useMemo(() => stageEntries(processes), [processes]);
  const process = processForStage(processes, processId);
  const base = `/${type === 'product' ? 'products' : 'experiments'}`;
  const draftScope = editingId ?? 'new';
  const localKey = `${type}:${id}:lifecycle:${draftScope}`;
  const applyPayload = (payload: EntryPayload) => {
    const nextValues = normalizeValues(processes, payload.values);
    setProcessId(availableStages.some((stage) => stage.key === payload.processId) ? payload.processId : availableStages[0]?.key ?? 'powder');
    setValues(nextValues); setSmartText(payload.smartText ?? ''); setDirty(false); setDraftStatus('草稿已恢复');
  };
  useEffect(() => {
    const subject = subjectState.data;
    if (!subject || initialized === `${id}:${draftScope}` || (editingId && !editingRecord)) return;
    if (!availableStages.some((stage) => stage.key === processId)) setProcessId(availableStages[0]?.key ?? 'powder');
    setValues(valuesFromLifecycle(processes, editingRecord));
    if (!editingRecord) {
      const local = readLocalDraft<EntryPayload>(localKey);
      if (local?.payload?.processes?.length && local.payload.values) applyPayload(local.payload);
      void miscApi.drafts({ subjectType: type, subjectId: id }).then((drafts) => {
        const candidates = drafts.filter((draft) => draft.processName === `lifecycle:${draftScope}` && draft.payload && typeof draft.payload === 'object' && 'values' in draft.payload);
        const cloud = candidates.sort((a,b) => b.clientUpdatedAt.localeCompare(a.clientUpdatedAt))[0];
        if (!cloud) return;
        setDraftVersion(cloud.version);
        if (!local || cloud.clientUpdatedAt > local.updatedAt) setCloudConflict(cloud);
      }).catch(() => setDraftStatus('云端草稿暂不可用，本机仍会保存'));
    }
    setInitialized(`${id}:${draftScope}`);
  }, [subjectState.data, editingRecord, id, draftScope, initialized, localKey, type, processes]);
  const payload = useMemo<EntryPayload>(() => ({ processId, processes, values, smartText }), [processId, processes, values, smartText]);
  const serialized = JSON.stringify(payload);
  useEffect(() => {
    if (initialized && processes.length && dirty) {
      writeLocalDraft(localKey, { ...payload, clientUpdatedAt: new Date().toISOString() });
      setDraftStatus('已保存到本机，等待同步云端');
    }
  }, [serialized, initialized, localKey, dirty]);
  useEffect(() => {
    if (!initialized || !dirty || !processes.length || editingId) return;
    const snapshot = { ...payload, clientUpdatedAt: new Date().toISOString() };
    const timer = window.setTimeout(() => {
      void miscApi.saveDraft({ subjectType: type, subjectId: id, processName: `lifecycle:${draftScope}`, payload: snapshot, clientUpdatedAt: snapshot.clientUpdatedAt, ...(draftVersion ? { version: draftVersion } : {}) }).then((draft) => {
        setDraftVersion(draft.version); setDraftStatus(`云端草稿已同步 · ${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`);
      }).catch(async (cause) => {
        if (cause && typeof cause === 'object' && 'code' in cause && cause.code === 'VERSION_CONFLICT') {
          try {
            const drafts = await miscApi.drafts({ subjectType: type, subjectId: id });
            const cloud = drafts.find((draft) => draft.processName === `lifecycle:${draftScope}` && draft.payload && typeof draft.payload === 'object' && 'values' in draft.payload);
            if (cloud) { setDraftVersion(cloud.version); setCloudConflict(cloud); setDraftStatus('发现云端新版本，请选择保留哪一侧'); return; }
          } catch { /* 本机草稿继续保留 */ }
        }
        setDraftStatus(cause instanceof Error ? `云端同步失败：${cause.message}` : '云端同步失败，本机草稿仍保留');
      });
    }, 1400);
    return () => window.clearTimeout(timer);
  }, [serialized, dirty, initialized, editingId, draftScope]);
  const updateValues = (fieldId: string, value: string) => {
    setValues((current) => ({ ...current, [processId]: { ...current[processId], [fieldId]: value } })); setDirty(true);
  };
  const parse = async () => {
    if (!process || !smartText.trim()) return;
    setParsing(true); setAssignments([]);
    try {
      const result = await recordApi.parse(smartText, process.fields);
      setAssignments(result.matchedAssignments); setUnmatched(result.unmatchedSegments);
      setParseWarnings([...result.warnings.map((warning) => warning.message), ...result.fieldConflicts.map((conflict) => `字段存在多段冲突，请确认识别值：${conflict.segments.join('；')}`)]);
    } catch (cause) { toast(cause instanceof Error ? cause.message : '解析失败', 'error'); } finally { setParsing(false); }
  };
  const confirmParse = () => {
    const next = { ...values[processId] };
    assignments.forEach((assignment) => { next[assignment.fieldId] = assignment.value; });
    setValues((current) => ({ ...current, [processId]: next })); setDirty(true); setAssignments([]); setMode('manual');
    toast('识别结果已回填，请继续核对后保存');
  };
  const save = async () => {
    const subject = subjectState.data;
    if (!subject) return;
    const nonEmptyStages = availableStages.filter(({ key }) => Object.values(values[key] ?? {}).some((value) => value.trim() !== ''));
    if (!nonEmptyStages.length) return toast('请至少填写一个工序的数据', 'error');
    for (const { key, label } of nonEmptyStages) {
      const stageProcess = processForStage(processes, key); const currentValues = values[key] ?? {};
      const missing = stageProcess?.fields.filter((field) => field.required && !currentValues[field.id]?.trim()) ?? [];
      if (missing.length) { setProcessId(key); return toast(`${label}请填写必填字段：${missing.map((field) => field.name).join('、')}`, 'error'); }
      const invalid = stageProcess?.fields.filter((field) => field.valueType === 'number' && currentValues[field.id] && !Number.isFinite(Number(currentValues[field.id]))) ?? [];
      if (invalid.length) { setProcessId(key); return toast(`${label}请输入有效数值：${invalid.map((field) => field.name).join('、')}`, 'error'); }
    }
    setSaving(true);
    const stages = nonEmptyStages.map(({ key }) => ({ stageKey: key, values: Object.entries(values[key] ?? {}).filter(([, value]) => value.trim() !== '').map(([fieldId, value]) => ({ fieldId, value })) }));
    try {
      if (editingRecord) await lifecycleApi.update(editingRecord.id, { subjectType: type, subjectId: id, stages, version: editingRecord.version });
      else await lifecycleApi.create({ subjectType: type, subjectId: id, stages });
      clearLocalDraft(localKey);
      if (!editingRecord) await miscApi.saveDraft({ subjectType: type, subjectId: id, processName: `lifecycle:${draftScope}`, payload: { cleared: true }, clientUpdatedAt: new Date().toISOString(), ...(draftVersion ? { version: draftVersion } : {}) }).catch(() => undefined);
      toast(editingRecord ? '生命周期记录已更新，全部工序已保存' : '生命周期记录已创建，全部工序已保存');
      navigate(`${base}/${id}`);
    } catch (cause) { toast(cause instanceof Error ? cause.message : '保存失败，草稿仍已保留', 'error'); } finally { setSaving(false); }
  };
  if (subjectState.loading) return <><PageHeader title="数据录入" /><div className="card"><Loading /></div></>;
  if (subjectState.error || !subjectState.data) return <ErrorState error={subjectState.error ?? '主体不存在'} retry={() => void subjectState.reload()} />;
  const subject = subjectState.data;
  return <div className="pb-20">
    <PageHeader back={() => navigate(`${base}/${id}`)} eyebrow={editingRecord ? `RECORD #${editingRecord.recordNo}` : 'NEW LIFECYCLE RECORD'} title={editingRecord ? `继续录入 · 记录 #${editingRecord.recordNo}` : '录入生命周期数据'} description={`${subject.name} · ${subject.code} · 固定模板：${subject.templateName}`} actions={<Badge tone={dirty ? 'amber' : 'green'}>{dirty ? '有未提交修改' : '内容已同步'}</Badge>} />
    {cloudConflict && <div className="card mb-5 flex flex-col gap-3 border-warning-500/30 bg-warning-50 p-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="font-medium text-warning-700">发现更新的云端草稿</div><p className="mt-1 text-xs text-ink-500">云端更新于 {new Date(cloudConflict.clientUpdatedAt).toLocaleString('zh-CN')}，请选择要保留的版本。</p></div><div className="flex gap-2"><Button variant="secondary" onClick={() => setCloudConflict(null)}>保留当前版本</Button><Button onClick={() => { applyPayload(cloudConflict.payload as EntryPayload); setCloudConflict(null); }}>使用云端版本</Button></div></div>}
    <section className="card mb-5 overflow-hidden">
      <div className="flex flex-col gap-3 px-4 pt-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="section-title">全生命周期工序</h2><p className="mt-1 text-xs text-ink-400">可分工序填写，保存时一次提交全部已填内容；未完成工序可稍后补录</p></div>{canManage(user) && <Link to={`/templates/${subject.templateId}/edit`} className="flex min-h-touch items-center text-sm text-brand-700 hover:underline">更新录入结构<Icon name="chevronRight" size={16} /></Link>}</div>
      <Tabs className="mt-3" value={processId} onChange={(value) => { setProcessId(value as StageKey); setAssignments([]); }} items={availableStages.map(({ key, label }) => ({ value: key, label, count: Object.values(values[key] ?? {}).filter((value) => value.trim() !== '').length }))} />
    </section>
    <div className="grid items-start gap-5 xl:grid-cols-[1fr_320px]">
      <section className="card overflow-hidden"><Tabs value={mode} onChange={(value) => { setMode(value as 'manual' | 'smart'); setAssignments([]); }} items={[{ value: 'manual', label: '手动录入' }, { value: 'smart', label: '智能文本解析' }]} />
        {mode === 'manual' ? <div className="p-5 sm:p-6"><div className="mb-5"><h2 className="section-title">{process?.name} · 数据表单</h2><p className="mt-1 text-xs text-ink-400">带 * 为已开始录入工序的必填项；空值与数值 0 分开保存</p></div><div className="grid gap-5 md:grid-cols-2">{process?.fields.slice().sort((a,b) => a.sortOrder-b.sortOrder).map((field) => {
          const value = values[processId]?.[field.id] ?? ''; const number = Number(value);
          const outside = field.valueType === 'number' && value !== '' && ((field.minValue !== null && number < field.minValue) || (field.maxValue !== null && number > field.maxValue));
          return <Field key={field.id} label={field.name} required={field.required} error={outside ? `当前值超出参考区间 ${field.minValue ?? '—'} ~ ${field.maxValue ?? '—'}，请确认` : ''} className={field.valueType === 'text' ? 'md:col-span-2' : ''}>{field.valueType === 'text' ? <Textarea value={value} onChange={(e) => updateValues(field.id, e.target.value)} placeholder={`请输入${field.name}`} /> : <Input type={fieldInputType(field.valueType)} inputMode={field.valueType === 'number' ? 'decimal' : undefined} step="any" unit={field.unit} value={value} onChange={(e) => updateValues(field.id, e.target.value)} placeholder={field.valueType === 'number' ? '请输入数值' : '请选择日期'} />}</Field>;
        })}</div></div> : <div className="p-5 sm:p-6"><Field label="粘贴或输入整段数据" hint="解析结果只回填当前工序，最后仍随全部工序一次保存"><Textarea value={smartText} onChange={(e) => { setSmartText(e.target.value); setDirty(true); }} className="min-h-48 font-mono text-[13px]" placeholder={'粉料粒度：5，粉料配比 Fe80%\n压制压力：200，生坯密度 3.2'} /></Field><Button className="mt-4" icon="spark" loading={parsing} disabled={!smartText.trim()} onClick={() => void parse()}>解析并预览</Button>
          {(assignments.length > 0 || unmatched.length > 0) && <div className="mt-6 rounded-xl border border-brand-100 bg-brand-50/30 p-4"><h3 className="font-semibold text-brand-900">解析预览 · 确认后才会回填</h3><div className="mt-3 divide-y divide-brand-100">{assignments.map((assignment, index) => <div key={`${assignment.fieldId}-${index}`} className="grid gap-2 py-3 sm:grid-cols-[1fr_1fr_auto] sm:items-center"><div><div className="text-sm font-medium">{assignment.fieldName}</div><div className="mt-1 truncate text-xs text-ink-400">原文：{assignment.rawSegment} · 置信度 {Math.round(assignment.score * 100)}%</div></div><Input value={assignment.value} onChange={(e) => setAssignments((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, value: e.target.value } : item))} aria-label={`${assignment.fieldName}识别值`} /><Badge tone={assignment.score >= .8 ? 'green' : 'amber'}>{assignment.score >= .8 ? '匹配' : '请核对'}</Badge></div>)}</div>{unmatched.length > 0 && <div className="mt-3 rounded-lg bg-warning-50 p-3 text-sm text-warning-700"><strong>未匹配文本：</strong>{unmatched.map((segment) => <div key={segment} className="mt-1 bg-yellow-100 px-1">{segment}</div>)}</div>}{parseWarnings.map((warning,index) => <p key={index} className="mt-2 text-xs text-warning-700">{warning}</p>)}<Button className="mt-4" icon="check" onClick={confirmParse} disabled={!assignments.length}>确认识别结果并回填</Button></div>}
        </div>}
      </section>
      <aside className="card p-5 xl:sticky xl:top-24"><h3 className="section-title">本次录入摘要</h3><dl className="mt-4 space-y-3 text-sm"><div className="flex justify-between gap-3"><dt className="text-ink-400">所属主体</dt><dd className="text-right font-medium">{subject.name}</dd></div><div className="flex justify-between gap-3"><dt className="text-ink-400">固定模板</dt><dd className="text-right font-medium">{subject.templateName}</dd></div>{availableStages.map(({ key, label }) => <div className="flex justify-between gap-3" key={key}><dt className="text-ink-400">{label}</dt><dd>{Object.values(values[key] ?? {}).some((value) => value.trim()) ? <Badge tone="green">已填写</Badge> : <Badge>待补录</Badge>}</dd></div>)}<div className="flex justify-between gap-3"><dt className="text-ink-400">录入人</dt><dd>{user?.displayName}</dd></div></dl><div className="mt-5 rounded-lg bg-ink-50 p-3 text-xs leading-5 text-ink-500"><Icon name="save" size={15} className="mr-1 inline" />{draftStatus}<br />所有已填工序将在同一事务中保存。</div></aside>
    </div>
    <div className="fixed inset-x-0 bottom-16 z-20 border-t border-ink-100 bg-white/95 px-4 py-3 backdrop-blur lg:bottom-0 lg:left-60 lg:px-8"><div className="mx-auto flex max-w-[1440px] items-center justify-between gap-3"><span className="hidden text-xs text-ink-400 sm:block">可暂存部分工序，之后打开原记录继续补录</span><div className="flex w-full justify-end gap-2 sm:w-auto"><Button variant="secondary" onClick={() => navigate(`${base}/${id}`)}>取消</Button><Button icon="save" loading={saving} onClick={() => void save()}>{editingRecord ? '保存全部工序' : '创建整条记录'}</Button></div></div></div>
  </div>;
}
