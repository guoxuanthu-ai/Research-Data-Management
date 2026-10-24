import { useEffect, useState, type FormEvent } from 'react';
import type { SubjectDetailDto, SubjectInput, SubjectType, UserDto } from '@rds/shared';
import { subjectApi, templateApi } from '../../api';
import { useAuth } from '../../auth/AuthProvider';
import { canManage } from '../../auth/permissions';
import { Button } from '../../components/ui/Button';
import { Field, Input, Select, Textarea } from '../../components/ui/Form';
import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../components/ui/Toast';
import { useAsync } from '../../hooks/useAsync';
import { today } from '../../utils/date';

const emptyForm = (ownerId: string): SubjectInput => ({ code: '', name: '', purpose: '', ownerId, date: today(), remark: '', templateId: '' });

export function SubjectFormDialog({ open, onClose, type, subject, users, onSaved }: { open: boolean; onClose: () => void; type: SubjectType; subject?: SubjectDetailDto | null; users: UserDto[]; onSaved: () => void }) {
  const { user } = useAuth(); const { toast } = useToast(); const isExperiment = type === 'experiment';
  const templates = useAsync(() => open && !subject ? templateApi.list(false) : Promise.resolve([]), [open, subject?.id]);
  const [form, setForm] = useState<SubjectInput>(emptyForm(user?.id ?? ''));
  const [saving, setSaving] = useState(false); const [error, setError] = useState('');
  useEffect(() => {
    if (!open) return;
    setForm(subject ? { code: subject.code, name: subject.name, purpose: subject.purpose, ownerId: subject.ownerId, date: subject.date, remark: subject.remark, version: subject.version, templateId: subject.templateId } : emptyForm(user?.id ?? ''));
    setError('');
  }, [open, subject, user?.id]);
  useEffect(() => {
    if (!subject && !form.templateId && templates.data?.[0]) update('templateId', templates.data[0].id);
  }, [templates.data, subject, form.templateId]);
  const update = <K extends keyof SubjectInput>(key: K, value: SubjectInput[K]) => setForm((current) => ({ ...current, [key]: value }));
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError('');
    if (!form.name.trim() || !form.ownerId || !form.templateId) { setError('请填写名称，选择负责人和固定录入模板'); return; }
    setSaving(true);
    try {
      const data = { ...form };
      if (data.code?.trim()) data.code = data.code.trim(); else delete data.code;
      if (subject) await subjectApi.update(type, subject.id, data); else await subjectApi.create(type, data);
      toast(`${isExperiment ? '实验' : '产品'}已${subject ? '更新' : '创建'}`); onSaved(); onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : '保存失败'); } finally { setSaving(false); }
  };
  const owners = canManage(user) ? users : user ? [{ id: user.id, displayName: user.displayName } as UserDto] : [];
  return <Modal open={open} onClose={onClose} title={`${subject ? '编辑' : '新建'}${isExperiment ? '实验' : '产品'}`} description={isExperiment ? '实验编号可自动生成，创建后可持续补充同一生命周期的工序数据。' : '以产品型号为主线，按统一结构沉淀全生命周期工艺数据。'} footer={<><Button variant="secondary" onClick={onClose}>取消</Button><Button type="submit" form="subject-form" loading={saving}>保存</Button></>}>
    <form id="subject-form" className="grid gap-5 sm:grid-cols-2" onSubmit={(event) => void submit(event)}>
      <Field label={isExperiment ? '实验编号' : '产品型号'} hint={isExperiment ? '留空则由系统自动生成' : '建议使用内部统一型号'}><Input value={form.code} onChange={(e) => update('code', e.target.value)} placeholder={isExperiment ? '系统自动生成' : '例如：CI-1206'} /></Field>
      <Field label={isExperiment ? '实验名称' : '产品名称'} required><Input value={form.name} onChange={(e) => update('name', e.target.value)} placeholder="请输入名称" /></Field>
      <Field label="负责人" required><Select value={form.ownerId} onChange={(e) => update('ownerId', e.target.value)}><option value="">请选择负责人</option>{owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.displayName}</option>)}</Select></Field>
      <Field label={isExperiment ? '实验日期' : '创建日期'}><Input type="date" value={form.date} onChange={(e) => update('date', e.target.value)} /></Field>
      <Field label="固定录入模板" required hint={subject ? '模板已固定。如需调整字段，请在详情页使用“更新录入结构”。' : '创建后每次录入都会使用此结构，无需重复选择。'} className="sm:col-span-2">
        {subject ? <Input value={`${subject.templateName} · v${subject.templateVersion}`} disabled /> : <Select value={form.templateId} onChange={(e) => update('templateId', e.target.value)} disabled={templates.loading}><option value="">请选择模板</option>{templates.data?.map((template) => <option key={template.id} value={template.id}>{template.name} · v{template.version}</option>)}</Select>}
      </Field>
      {isExperiment && <Field label="实验目的" className="sm:col-span-2"><Textarea value={form.purpose} onChange={(e) => update('purpose', e.target.value)} placeholder="本次实验希望验证什么？" /></Field>}
      <Field label="备注" className="sm:col-span-2"><Textarea value={form.remark} onChange={(e) => update('remark', e.target.value)} placeholder="补充背景、批次或注意事项（选填）" /></Field>
      {error && <div className="rounded-lg bg-danger-50 p-3 text-sm text-danger-700 sm:col-span-2">{error}</div>}
    </form>
  </Modal>;
}
