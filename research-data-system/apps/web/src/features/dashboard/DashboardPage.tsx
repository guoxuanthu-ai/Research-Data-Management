import { Link } from 'react-router-dom';
import { miscApi } from '../../api';
import { useAuth } from '../../auth/AuthProvider';
import { Button } from '../../components/ui/Button';
import { EmptyState, ErrorState, Loading, PageHeader, Badge } from '../../components/ui/Feedback';
import { Icon, type IconName } from '../../components/ui/Icon';
import { useAsync } from '../../hooks/useAsync';
import { formatDate, formatDateTime } from '../../utils/date';
const actionLabels: Record<string, string> = { create: '创建了', update: '更新了', delete: '删除了', restore: '恢复了', record_create: '录入了', record_update: '更新了', import_confirm: '批量导入了' };
export function DashboardPage() {
  const { user } = useAuth(); const { data, loading, error, reload } = useAsync(miscApi.dashboard, []);
  if (loading) return <><PageHeader title="工作概览" /><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[1,2,3,4].map((n) => <div key={n} className="card h-32 animate-pulse bg-white" />)}</div><div className="card mt-6"><Loading /></div></>;
  if (error || !data) return <ErrorState error={error ?? '暂无看板数据'} retry={() => void reload()} />;
  const cards: Array<{ label: string; value: number; sub: string; icon: IconName; to: string }> = [
    { label: '本周实验', value: data.weekExperiments, sub: `累计 ${data.totalExperiments} 项`, icon: 'flask', to: '/experiments' },
    { label: '本月实验', value: data.monthExperiments, sub: '保持探索，持续验证', icon: 'clock', to: '/experiments' },
    { label: '本月产品', value: data.monthProducts, sub: `累计 ${data.totalProducts} 个`, icon: 'box', to: '/products' },
    { label: '本月录入', value: data.monthRecords, sub: '条过程数据已沉淀', icon: 'edit', to: '/experiments' },
  ];
  return <><PageHeader eyebrow="OVERVIEW" title={`${user?.displayName}，欢迎回来`} description="这里汇总了研发团队近期的数据进展与待办提醒。" actions={<Link to="/experiments"><Button icon="plus">新建实验</Button></Link>} />
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{cards.map((card) => <Link key={card.label} to={card.to} className="card group p-5 transition-shadow hover:shadow-lift"><div className="flex items-start justify-between"><div><p className="text-sm text-ink-500">{card.label}</p><div className="mt-3 text-3xl font-semibold tracking-tight text-ink-950 tabular-nums">{card.value}</div></div><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700 transition-colors group-hover:bg-brand-100"><Icon name={card.icon} size={20} /></div></div><p className="mt-3 text-xs text-ink-400">{card.sub}</p></Link>)}</div>
    <div className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_1fr]"><section className="card overflow-hidden"><div className="flex items-center justify-between border-b border-ink-100 px-5 py-4"><div><h2 className="section-title">近期录入动态</h2><p className="mt-0.5 text-xs text-ink-400">团队最新的数据变更</p></div><Badge tone="green">实时更新</Badge></div>{data.activities.length ? <div className="divide-y divide-ink-100 px-5">{data.activities.map((item) => <div key={item.id} className="flex gap-3 py-4"><div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink-50 text-xs font-semibold text-ink-600">{item.actorName.slice(0,1)}</div><div className="min-w-0 flex-1"><p className="text-sm leading-6 text-ink-700"><span className="font-medium text-ink-900">{item.actorName}</span> {actionLabels[item.action] ?? item.action} <span className="font-medium text-brand-800">{item.subjectName}</span></p><p className="mt-0.5 text-xs text-ink-400">{formatDateTime(item.createdAt)}</p></div></div>)}</div> : <EmptyState icon="clock" title="还没有录入动态" description="完成第一笔数据录入后，团队动态会显示在这里。" />}</section>
    <section className="card overflow-hidden"><div className="border-b border-ink-100 px-5 py-4"><h2 className="section-title">漏记提醒</h2><p className="mt-0.5 text-xs text-ink-400">实验创建后仍未录入过程数据</p></div>{data.missingEntries.length ? <div className="divide-y divide-ink-100 px-5">{data.missingEntries.map((item) => <Link to={`/experiments/${item.id}/entry`} key={item.id} className="block py-4 hover:bg-warning-50/40"><div className="flex items-center justify-between gap-3"><span className="truncate font-medium text-ink-800">{item.name}</span><Badge tone="amber">已等待 {item.daysMissing} 天</Badge></div><div className="mt-1.5 flex flex-wrap gap-x-3 text-xs text-ink-400"><span className="mono">{item.code}</span><span>{item.ownerName}</span><span>{formatDate(item.date)}</span></div></Link>)}</div> : <EmptyState icon="check" title="记录很及时" description="当前没有超过期限仍未录入的实验。" />}</section></div>
  </>;
}
