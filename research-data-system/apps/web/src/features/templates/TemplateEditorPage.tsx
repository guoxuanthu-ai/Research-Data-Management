import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { ProcessStructure } from '@rds/shared';
import { templateApi } from '../../api';
import { Button } from '../../components/ui/Button';
import { ErrorState, Loading, PageHeader } from '../../components/ui/Feedback';
import { Field, Input } from '../../components/ui/Form';
import { Tabs } from '../../components/ui/Tabs';
import { useToast } from '../../components/ui/Toast';
import { useAsync } from '../../hooks/useAsync';
import { blankProcess } from '../records/recordFormState';
import { ProcessEditor } from './ProcessEditor';

export function TemplateEditorPage() {
  const { id } = useParams(); const navigate = useNavigate(); const { toast } = useToast();
  const state = useAsync(() => id ? templateApi.list(true) : Promise.resolve([]), [id]);
  const template = state.data?.find((item) => item.id === id);
  const [name, setName] = useState(''); const [description, setDescription] = useState(''); const [processes, setProcesses] = useState<ProcessStructure[]>([]); const [processId, setProcessId] = useState('');
  const [saving, setSaving] = useState(false); const [ready, setReady] = useState(false);
  const process = processes.find((item) => item.id === processId) ?? processes[0];
  useEffect(() => {
    if (state.loading || ready) return;
    if (template) {
      setName(template.name); setDescription(template.description);
      setProcesses(template.processes.map((item) => ({ ...item, fields: item.fields.map((field) => ({ ...field })) })));
      setProcessId(template.processes[0]?.id ?? '');
    } else if (!id) {
      const initial = ['粉料', '压制', '热处理'].map((processName, index) => ({ ...blankProcess(index), name: processName, sortOrder: index * 10 }));
      setProcesses(initial); setProcessId(initial[0]?.id ?? '');
    }
    setReady(true);
  }, [state.loading, template, id, ready]);
  const save = async () => {
    if (!name.trim()) return toast('请输入模板名称', 'error');
    if (!processes.length || processes.some((item) => !item.name.trim() || !item.fields.length || item.fields.some((field) => !field.name.trim()))) return toast('至少保留一个工序，每个工序至少保留一个命名字段', 'error');
    if (new Set(processes.map((item) => item.name.trim())).size !== processes.length) return toast('工序名称不能重复', 'error');
    const duplicate = processes.some((item) => new Set(item.fields.map((field) => field.name.trim())).size !== item.fields.length);
    if (duplicate) return toast('同一工序内字段名称不能重复', 'error');
    if (template && !window.confirm('更新录入结构会同步所有历史和未来记录。新增工序可用于后续补录；删除工序会删除所有记录中的该工序及数据，删除字段也会删除对应值。确认继续保存吗？')) return;
    setSaving(true);
    const data = { name: name.trim(), description: description.trim(), processes: processes.map((item,index) => ({ ...item, name: item.name.trim(), sortOrder: index * 10, fields: item.fields.map((field,fieldIndex) => ({ ...field, name: field.name.trim(), sortOrder: fieldIndex * 10 })) })), ...(template ? { version: template.version } : {}) };
    try {
      if (id && template) await templateApi.update(id, data); else await templateApi.create(data);
      toast(`模板已${id ? '更新，历史记录结构已同步' : '创建'}`); navigate('/templates');
    } catch (cause) { toast(cause instanceof Error ? cause.message : '保存失败', 'error'); } finally { setSaving(false); }
  };
  if (state.loading || !ready) return <><PageHeader title="编辑模板" /><div className="card"><Loading /></div></>;
  if (state.error || (id && !template)) return <ErrorState error={state.error ?? '模板不存在'} retry={() => void state.reload()} />;
  return <div className="pb-20">
    <PageHeader back={() => navigate('/templates')} eyebrow="TEMPLATE EDITOR" title={id ? '更新录入结构' : '新建工序模板'} description={id ? '任意工序和字段都可按实际流程调整，变更会同步历史及未来记录。' : '默认提供粉料、压制、热处理，可自由增删或改名。'} actions={<><Button variant="secondary" onClick={() => navigate('/templates')}>取消</Button><Button icon="save" loading={saving} onClick={() => void save()}>保存并同步</Button></>} />
    <section className="card mb-5 grid gap-5 p-5 md:grid-cols-2"><Field label="模板名称" required><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="如：电感标准工艺流程" /></Field><Field label="模板说明"><Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="适用产品或使用场景" /></Field><div className="rounded-lg bg-warning-50 p-3 text-xs leading-5 text-warning-700 md:col-span-2">新增工序可用于后续补录；名称、类型、单位、必填和区间修改会同步。删除工序会删除所有记录中的该工序及数据，删除字段也会删除对应值，请谨慎操作。</div></section>
    <section className="card overflow-hidden"><div className="p-4"><h2 className="section-title">实际工序与数据类别</h2><p className="mt-1 text-xs text-ink-400">至少保留一个工序；可新增、改名、排序或删除任意工序</p></div><Tabs value={process?.id ?? ''} onChange={setProcessId} items={processes.map((item) => ({ value: item.id, label: item.name, count: item.fields.length }))} />{process && <ProcessEditor process={process} onChange={(next) => setProcesses((current) => current.map((item) => item.id === next.id ? next : item))} onMove={(direction) => {
      const index = processes.findIndex((item) => item.id === process.id); const target = index + direction;
      if (target < 0 || target >= processes.length) return;
      const next = [...processes]; [next[index], next[target]] = [next[target]!, next[index]!];
      setProcesses(next.map((item, itemIndex) => ({ ...item, sortOrder: itemIndex * 10 })));
    }} onAdd={() => { const next = blankProcess(processes.length); setProcesses([...processes, next]); setProcessId(next.id); }} onRemove={() => {
      if (processes.length <= 1) return toast('模板至少需要保留一个工序', 'error');
      const next = processes.filter((item) => item.id !== process.id); setProcesses(next); setProcessId(next[0]!.id);
    }} />}</section>
    <div className="sticky bottom-16 z-10 mt-5 flex justify-end gap-2 rounded-xl border border-ink-100 bg-white/95 p-3 shadow-card backdrop-blur lg:bottom-4"><Button variant="secondary" onClick={() => navigate('/templates')}>取消</Button><Button icon="save" loading={saving} onClick={() => void save()}>{id ? '保存并同步历史' : '创建模板'}</Button></div>
  </div>;
}
