import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { TemplateDto } from '@rds/shared';
import { templateApi } from '../../api';
import { Button } from '../../components/ui/Button';
import { Badge, EmptyState, ErrorState, Loading, PageHeader } from '../../components/ui/Feedback';
import { Select } from '../../components/ui/Form';
import { Icon } from '../../components/ui/Icon';
import { ConfirmDialog } from '../../components/ui/Modal';
import { useToast } from '../../components/ui/Toast';
import { useAsync } from '../../hooks/useAsync';
import { formatDateTime } from '../../utils/date';

export function TemplateListPage() {
  const [status, setStatus] = useState('');
  const { data, loading, error, reload } = useAsync(() => templateApi.list(true), []);
  const { toast } = useToast();
  const [target, setTarget] = useState<TemplateDto | null>(null);
  const [deleting, setDeleting] = useState<TemplateDto | null>(null);
  const [saving, setSaving] = useState(false);
  const filtered = data?.filter((template) => !status || template.status === status) ?? [];
  const toggle = async () => {
    if (!target) return;
    setSaving(true);
    try {
      await templateApi.status(target.id, target.status === 'active' ? 'disabled' : 'active', target.version);
      toast(target.status === 'active' ? '模板已停用，历史记录不受影响' : '模板已启用'); setTarget(null); await reload();
    } catch (cause) { toast(cause instanceof Error ? cause.message : '操作失败', 'error'); } finally { setSaving(false); }
  };
  const remove = async () => {
    if (!deleting) return;
    setSaving(true);
    try {
      await templateApi.remove(deleting.id, deleting.version);
      toast(`模板“${deleting.name}”已删除`); setDeleting(null); await reload();
    } catch (cause) { toast(cause instanceof Error ? cause.message : '删除失败', 'error'); } finally { setSaving(false); }
  };
  return <>
    <PageHeader eyebrow="TEMPLATES" title="工序模板" description="按实际研发流程配置任意工序；更新结构会同步全部历史及未来记录。" actions={<Link to="/templates/new"><Button icon="plus">新建模板</Button></Link>} />
    <div className="card mb-5 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm text-ink-500">共 {data?.length ?? 0} 套模板，{data?.filter((item) => item.status === 'active').length ?? 0} 套启用中</p><Select value={status} onChange={(e) => setStatus(e.target.value)} className="sm:w-44" aria-label="模板状态"><option value="">全部状态</option><option value="active">启用中</option><option value="disabled">已停用</option></Select></div>
    {loading ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{[1,2,3].map((n) => <div key={n} className="card h-64 animate-pulse" />)}</div> : error ? <div className="card"><ErrorState error={error} retry={() => void reload()} /></div> : !filtered.length ? <div className="card"><EmptyState icon="template" title="暂无模板" description="创建一套符合实际流程的工序与字段组合。" action={<Link to="/templates/new"><Button icon="plus">新建模板</Button></Link>} /></div> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{filtered.map((template) => <article key={template.id} className="card flex flex-col p-5 transition-shadow hover:shadow-lift">
      <div className="flex items-start justify-between gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700"><Icon name="template" size={20} /></div><Badge tone={template.status === 'active' ? 'green' : 'neutral'}>{template.status === 'active' ? '启用中' : '已停用'}</Badge></div>
      <h2 className="mt-4 text-lg font-semibold text-ink-900">{template.name}</h2><p className="mt-1 line-clamp-2 min-h-10 text-sm leading-5 text-ink-500">{template.description || '暂无模板说明'}</p>
      <div className="my-4 flex flex-wrap gap-2">{template.processes.map((process) => <span key={process.id} className="rounded-md bg-ink-50 px-2 py-1 text-xs text-ink-600">{process.name} · {process.fields.length} 项</span>)}</div>
      <div className="mt-auto flex items-center justify-between border-t border-ink-100 pt-4"><span className="text-xs text-ink-400">v{template.version} · {formatDateTime(template.updatedAt)}</span><div className="flex"><Link to={`/templates/${template.id}/edit`}><Button variant="ghost" className="px-3">编辑</Button></Link><Button variant="ghost" className="px-3" onClick={() => setTarget(template)}>{template.status === 'active' ? '停用' : '启用'}</Button><Button variant="ghost" className="px-3 text-danger-700" icon="trash" onClick={() => setDeleting(template)}>删除</Button></div></div>
    </article>)}</div>}
    <ConfirmDialog open={!!target} onClose={() => setTarget(null)} onConfirm={() => void toggle()} loading={saving} title={`${target?.status === 'active' ? '停用' : '启用'}模板“${target?.name ?? ''}”？`} description={target?.status === 'active' ? '停用后不能再绑定新主体，已有主体及其历史记录不受影响。' : '启用后，创建产品或实验时可以绑定此模板。'} confirmText={target?.status === 'active' ? '确认停用' : '确认启用'} />
    <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={() => void remove()} loading={saving} title={`删除模板“${deleting?.name ?? ''}”？`} description="仅未被在用产品或实验使用的模板可以删除。删除产品或实验后会释放模板；若之后恢复主体，关联模板也会自动恢复。" confirmText="确认删除" />
  </>;
}
