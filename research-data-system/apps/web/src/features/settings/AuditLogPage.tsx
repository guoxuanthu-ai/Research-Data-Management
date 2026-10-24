import { useEffect, useState } from 'react';
import type { AuditLogDto } from '@rds/shared';
import { miscApi, userApi } from '../../api';
import { useAuth } from '../../auth/AuthProvider';
import { Button } from '../../components/ui/Button';
import { DataTable } from '../../components/ui/DataTable';
import { Badge, EmptyState, ErrorState, Loading, PageHeader, Pagination } from '../../components/ui/Feedback';
import { Input, Select } from '../../components/ui/Form';
import { ConfirmDialog, Modal } from '../../components/ui/Modal';
import { useToast } from '../../components/ui/Toast';
import { useAsync } from '../../hooks/useAsync';
import { formatDateTime } from '../../utils/date';

const actionNames: Record<string,string> = { create: '创建', update: '修改', delete: '删除', restore: '恢复', login: '登录', import_confirm: '导入确认', export: '导出', reset_password: '重置密码', status: '状态变更', record_create: '记录创建', record_update: '记录修改' };

export function AuditLogPage() {
  const { user } = useAuth(); const { toast } = useToast();
  const director = user?.role === 'director';
  const [action, setAction] = useState(''); const [entityType, setEntityType] = useState(''); const [actorId, setActorId] = useState(''); const [startDate, setStart] = useState(''); const [endDate, setEnd] = useState(''); const [page, setPage] = useState(1); const [selected, setSelected] = useState<AuditLogDto | null>(null);
  const [deleting, setDeleting] = useState<AuditLogDto | null>(null); const [deletingLoading, setDeletingLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]); const [batchDeleting, setBatchDeleting] = useState(false); const [batchDeletingLoading, setBatchDeletingLoading] = useState(false);
  const actors = useAsync(() => userApi.list({ pageSize: 100 }), []);
  const { data, loading, error, reload } = useAsync(() => miscApi.audits({ action, entityType, actorId, dateFrom: startDate, dateTo: endDate, page, pageSize: 20 }), [action,entityType,actorId,startDate,endDate,page]);
  const currentIds = data?.items.map((row) => row.id) ?? [];
  const selectedOnPage = currentIds.filter((id) => selectedIds.includes(id)).length;
  const allSelected = currentIds.length > 0 && selectedOnPage === currentIds.length;
  const someSelected = selectedOnPage > 0 && !allSelected;

  useEffect(() => { setSelectedIds([]); setBatchDeleting(false); }, [action,entityType,actorId,startDate,endDate,page]);

  const remove = async () => {
    if (!deleting) return;
    setDeletingLoading(true);
    try {
      await miscApi.removeAudit(deleting.id);
      toast('审计日志已永久删除');
      setDeleting(null);
      setSelectedIds((ids) => ids.filter((id) => id !== deleting.id));
      await reload();
    } catch (cause) { toast(cause instanceof Error ? cause.message : '删除失败', 'error'); }
    finally { setDeletingLoading(false); }
  };
  const removeBatch = async () => {
    if (!selectedIds.length) return;
    setBatchDeletingLoading(true);
    try {
      const result = await miscApi.removeAudits(selectedIds);
      toast(`已永久删除 ${result.deletedCount} 条审计日志`);
      setSelectedIds([]);
      setBatchDeleting(false);
      await reload();
    } catch (cause) { toast(cause instanceof Error ? cause.message : '批量删除失败', 'error'); }
    finally { setBatchDeletingLoading(false); }
  };
  const toggleAll = () => {
    setSelectedIds((ids) => allSelected ? ids.filter((id) => !currentIds.includes(id)) : [...new Set([...ids, ...currentIds])]);
  };
  const toggleOne = (id: string) => {
    setSelectedIds((ids) => ids.includes(id) ? ids.filter((selectedId) => selectedId !== id) : [...ids, id]);
  };
  const changePage = (nextPage: number) => { setSelectedIds([]); setBatchDeleting(false); setPage(nextPage); };
  const changeFilter = (change: () => void) => { setSelectedIds([]); setBatchDeleting(false); setPage(1); change(); };

  return <>
    <PageHeader eyebrow="AUDIT TRAIL" title="审计日志" description="追踪账号、主体、模板与研发数据的每次变更，保留操作人、时间及前后快照。" />
    <div className="card mb-4 grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-[1fr_150px_150px_160px_160px]">
      <Select value={actorId} onChange={(e) => changeFilter(() => setActorId(e.target.value))} aria-label="操作人筛选"><option value="">全部操作人</option>{actors.data?.items.map((actor) => <option key={actor.id} value={actor.id}>{actor.displayName}</option>)}</Select>
      <Select value={action} onChange={(e) => changeFilter(() => setAction(e.target.value))} aria-label="操作类型"><option value="">全部操作</option><option value="create">创建</option><option value="update">修改</option><option value="delete">删除</option><option value="restore">恢复</option><option value="import_confirm">导入</option><option value="export">导出</option></Select>
      <Select value={entityType} onChange={(e) => changeFilter(() => setEntityType(e.target.value))} aria-label="对象类型"><option value="">全部对象</option><option value="user">账号</option><option value="product">产品</option><option value="experiment">实验</option><option value="record">过程记录</option><option value="template">模板</option></Select>
      <Input type="date" value={startDate} onChange={(e) => changeFilter(() => setStart(e.target.value))} aria-label="开始日期" />
      <Input type="date" value={endDate} onChange={(e) => changeFilter(() => setEnd(e.target.value))} aria-label="结束日期" />
    </div>
    <section className="card overflow-hidden">
      {director && <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 px-5 py-3"><span className="text-sm text-ink-600">已选 <strong className="text-ink-900">{selectedIds.length}</strong> 条</span><Button variant="danger" disabled={!selectedIds.length} onClick={() => setBatchDeleting(true)}>批量永久删除</Button></div>}
      {loading ? <Loading rows={8} /> : error ? <ErrorState error={error} retry={() => void reload()} /> : !data?.items.length ? <EmptyState icon="audit" title="暂无审计日志" description="当前筛选条件下没有操作记录。" /> : <>
        <DataTable rows={data.items} rowKey={(row) => row.id} onRowClick={setSelected} columns={[
          ...(director ? [{ key: 'select', title: <input ref={(node) => { if (node) node.indeterminate = someSelected; }} type="checkbox" aria-label="全选当前页" checked={allSelected} onChange={toggleAll} className="h-4 w-4 accent-brand-700" />, render: (row: AuditLogDto) => <input type="checkbox" aria-label={`选择审计日志 ${row.id}`} checked={selectedIds.includes(row.id)} onClick={(event) => event.stopPropagation()} onChange={() => toggleOne(row.id)} className="h-4 w-4 accent-brand-700" /> }] : []),
          { key: 'time', title: '操作时间', render: (row) => <span className="whitespace-nowrap mono text-xs">{formatDateTime(row.createdAt)}</span> },
          { key: 'actor', title: '操作人', render: (row) => <span className="font-medium text-ink-800">{row.actorName}</span> },
          { key: 'action', title: '操作', render: (row) => <Badge tone={row.action.includes('delete') ? 'red' : row.action.includes('create') ? 'green' : 'blue'}>{actionNames[row.action] ?? row.action}</Badge> },
          { key: 'entity', title: '对象', render: (row) => <div><div className="text-ink-700">{row.entityType}</div><div className="mt-1 max-w-40 truncate font-mono text-xs text-ink-400">{row.entityId}</div></div> },
          { key: 'request', title: '请求标识', render: (row) => <span className="font-mono text-xs text-ink-400">{row.requestId.slice(0,12)}</span> },
          { key: 'detail', title: '', render: () => <span className="text-xs text-brand-700">查看快照</span> },
          ...(director ? [{ key: 'actions', title: '操作', className: 'text-right', render: (row: AuditLogDto) => <Button variant="ghost" className="px-2 text-danger-700" onClick={(event) => { event.stopPropagation(); setDeleting(row); }}>删除</Button> }] : []),
        ]} />
        <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={changePage} />
      </>}
    </section>
    <Modal open={!!selected} onClose={() => setSelected(null)} title="审计快照详情" description={`${selected?.actorName ?? ''} · ${selected ? formatDateTime(selected.createdAt) : ''}`} size="xl">{selected && <div className="space-y-4"><div className="grid gap-3 rounded-xl bg-ink-50 p-4 text-xs sm:grid-cols-2"><div><span className="text-ink-400">操作对象：</span><span className="font-mono">{selected.entityType} / {selected.entityId}</span></div><div><span className="text-ink-400">请求标识：</span><span className="font-mono">{selected.requestId}</span></div></div><div className="grid gap-4 lg:grid-cols-2"><div><h3 className="mb-2 text-sm font-semibold text-ink-600">修改前</h3><pre className="scrollbar-thin max-h-[50vh] overflow-auto rounded-xl bg-ink-950 p-4 text-xs leading-5 text-ink-100">{selected.before ? JSON.stringify(selected.before,null,2) : '无（新建操作）'}</pre></div><div><h3 className="mb-2 text-sm font-semibold text-brand-700">修改后</h3><pre className="scrollbar-thin max-h-[50vh] overflow-auto rounded-xl bg-brand-950 p-4 text-xs leading-5 text-brand-100">{selected.after ? JSON.stringify(selected.after,null,2) : '无（删除操作）'}</pre></div></div><div className="flex justify-end"><Button variant="secondary" onClick={() => setSelected(null)}>关闭</Button></div></div>}</Modal>
    <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={() => void remove()} loading={deletingLoading} title="永久删除这条审计日志？" description="该日志及其前后快照将被物理删除，删除后不可恢复。此操作不会生成新的审计日志。" />
    <ConfirmDialog open={batchDeleting} onClose={() => setBatchDeleting(false)} onConfirm={() => void removeBatch()} loading={batchDeletingLoading} title={`永久删除选中的 ${selectedIds.length} 条审计日志？`} description="选中的日志及其前后快照将被物理删除，删除后不可恢复。此操作不会生成新的审计日志。" />
  </>;
}
