import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { SubjectDetailDto, SubjectType } from '@rds/shared';
import { subjectApi, userApi } from '../../api';
import { useAuth } from '../../auth/AuthProvider';
import { canEditOwned, canManage } from '../../auth/permissions';
import { Button } from '../../components/ui/Button';
import { DataTable } from '../../components/ui/DataTable';
import { Badge, EmptyState, ErrorState, Loading, PageHeader, Pagination } from '../../components/ui/Feedback';
import { Input, Select } from '../../components/ui/Form';
import { Icon } from '../../components/ui/Icon';
import { ConfirmDialog } from '../../components/ui/Modal';
import { useToast } from '../../components/ui/Toast';
import { useAsync } from '../../hooks/useAsync';
import { formatDate, formatDateTime } from '../../utils/date';
import { ImportDialog } from '../imports/ImportDialog';
import { SubjectFormDialog } from './SubjectFormDialog';
export function SubjectListPage({ type }: { type: SubjectType }) {
  const isExperiment = type === 'experiment'; const label = isExperiment ? '实验' : '产品'; const base = `/${type === 'product' ? 'products' : 'experiments'}`;
  const { user } = useAuth(); const manager = canManage(user); const navigate = useNavigate(); const { toast } = useToast();
  const [search, setSearch] = useState(''); const [ownerId, setOwner] = useState(''); const [startDate, setStart] = useState(''); const [endDate, setEnd] = useState(''); const [showDeleted, setShowDeleted] = useState(false); const [page, setPage] = useState(1);
  const params = { q: search, ownerId, startDate: isExperiment ? startDate : '', endDate: isExperiment ? endDate : '', includeDeleted: manager && showDeleted, page, pageSize: 20 };
  const { data, loading, error, reload } = useAsync(() => subjectApi.list(type, params), [type, search, ownerId, startDate, endDate, showDeleted, page]);
  const owners = useAsync(() => manager ? userApi.list({ pageSize: 100, status: 'active' }) : Promise.resolve(null), [manager]);
  const [formOpen, setFormOpen] = useState(false); const [editing, setEditing] = useState<SubjectDetailDto | null>(null); const [importOpen, setImportOpen] = useState(false); const [deleting, setDeleting] = useState<SubjectDetailDto | null>(null); const [actionLoading, setActionLoading] = useState(false); const [exporting, setExporting] = useState(false);
  const remove = async () => { if (!deleting) return; setActionLoading(true); try { await subjectApi.remove(type, deleting.id, deleting.version); toast(`${label}已删除，可通过“显示已删除”恢复`); setDeleting(null); await reload(); } catch (cause) { toast(cause instanceof Error ? cause.message : '删除失败', 'error'); } finally { setActionLoading(false); } };
  const restore = async (item: SubjectDetailDto) => { setActionLoading(true); try { await subjectApi.restore(type, item.id, item.version); toast(`${label}已恢复`); await reload(); } catch (cause) { toast(cause instanceof Error ? cause.message : '恢复失败', 'error'); } finally { setActionLoading(false); } };
  const exportData = async () => { setExporting(true); try { await subjectApi.export(type, params); toast('导出文件已开始下载'); } catch (cause) { toast(cause instanceof Error ? cause.message : '导出失败', 'error'); } finally { setExporting(false); } };
  const resetPage = (setter: (value: string) => void, value: string) => { setter(value); setPage(1); };
  return <><PageHeader eyebrow={isExperiment ? 'EXPERIMENTS' : 'PRODUCTS'} title={`${label}管理`} description={isExperiment ? '以单次实验为主线，集中记录实验目的、过程参数与结果。' : '按产品型号管理工艺与性能数据，形成可追溯的产品档案。'} actions={<><Button variant="secondary" icon="upload" onClick={() => setImportOpen(true)}>导入</Button><Button variant="secondary" icon="download" loading={exporting} onClick={() => void exportData()}>导出</Button><Button icon="plus" onClick={() => { setEditing(null); setFormOpen(true); }}>新建{label}</Button></>} />
    <div className="card mb-4 p-4"><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(240px,1fr)_180px_170px_170px_auto]"><label className="relative block"><Icon name="search" size={18} className="pointer-events-none absolute left-3 top-3 text-ink-400" /><Input value={search} onChange={(e) => resetPage(setSearch, e.target.value)} placeholder={isExperiment ? '搜索实验名称、编号或目的' : '搜索产品型号或名称'} className="pl-10" /></label><Select value={ownerId} onChange={(e) => resetPage(setOwner, e.target.value)} aria-label="按负责人筛选"><option value="">全部负责人</option>{owners.data?.items.map((owner) => <option key={owner.id} value={owner.id}>{owner.displayName}</option>)}</Select>{isExperiment ? <><Input type="date" value={startDate} onChange={(e) => resetPage(setStart, e.target.value)} aria-label="开始日期" /><Input type="date" value={endDate} onChange={(e) => resetPage(setEnd, e.target.value)} aria-label="结束日期" /></> : <div className="hidden xl:col-span-2 xl:block" />}{manager && <label className="flex min-h-touch cursor-pointer items-center gap-2 whitespace-nowrap text-sm text-ink-600"><input type="checkbox" checked={showDeleted} onChange={(e) => { setShowDeleted(e.target.checked); setPage(1); }} className="h-4 w-4 accent-brand-700" />显示已删除</label>}</div></div>
    <section className="card overflow-hidden">{loading ? <Loading rows={7} /> : error ? <ErrorState error={error} retry={() => void reload()} /> : !data?.items.length ? <EmptyState icon={isExperiment ? 'flask' : 'box'} title={search || ownerId || startDate ? '没有符合条件的数据' : `还没有${label}`} description={search || ownerId || startDate ? '尝试调整关键词或筛选条件。' : `新建第一个${label}，开始沉淀过程数据。`} action={!search && !ownerId ? <Button icon="plus" onClick={() => setFormOpen(true)}>新建{label}</Button> : undefined} /> : <><DataTable rows={data.items} rowKey={(row) => row.id} onRowClick={(row) => navigate(`${base}/${row.id}`)} columns={[
      { key: 'name', title: `${label}名称 / 编号`, render: (row) => <div className="flex items-center gap-2"><div className="min-w-0"><div className="font-medium text-ink-900">{row.name}</div><div className="mt-1 font-mono text-xs text-ink-400">{row.code || '—'}</div></div>{row.deletedAt && <Badge tone="red">已删除</Badge>}</div> },
      ...(isExperiment ? [{ key: 'purpose', title: '实验目的', className: 'max-w-xs', render: (row: SubjectDetailDto) => <p className="truncate text-ink-500">{row.purpose || '—'}</p> }] : []),
      { key: 'owner', title: '负责人', render: (row) => row.ownerName }, { key: 'date', title: isExperiment ? '实验日期' : '创建日期', render: (row) => <span className="mono">{formatDate(row.date)}</span> },
      { key: 'records', title: '过程记录', render: (row) => <Badge tone={row.recordCount ? 'green' : 'neutral'}>{row.recordCount} 条</Badge> },
      { key: 'updated', title: '最近更新', render: (row) => <span className="whitespace-nowrap text-xs text-ink-400">{formatDateTime(row.updatedAt)}</span> },
      { key: 'actions', title: <span className="sr-only">操作</span>, className: 'text-right', render: (row) => <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>{row.deletedAt ? <Button variant="ghost" icon="restore" loading={actionLoading} onClick={() => void restore(row)}>恢复</Button> : <>{canEditOwned(user, row.createdBy) && <Button variant="ghost" className="px-3" onClick={() => { setEditing(row); setFormOpen(true); }} aria-label={`编辑${row.name}`}><Icon name="edit" size={17} /></Button>}{manager && <Button variant="ghost" className="px-3 text-danger-700" onClick={() => setDeleting(row)} aria-label={`删除${row.name}`}><Icon name="trash" size={17} /></Button>}</>}</div> },
    ]} /><Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={setPage} /></>}</section>
    <SubjectFormDialog open={formOpen} onClose={() => setFormOpen(false)} type={type} subject={editing} users={owners.data?.items ?? []} onSaved={() => void reload()} /><ImportDialog open={importOpen} onClose={() => setImportOpen(false)} type={type} onComplete={() => void reload()} /><ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={() => void remove()} loading={actionLoading} title={`删除${label}“${deleting?.name ?? ''}”？`} description="删除后该主体及其记录不会出现在默认列表中，但可由管理员恢复。此操作会保留完整审计记录。" />
  </>;
}
