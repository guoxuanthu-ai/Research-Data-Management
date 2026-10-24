import type { ProcessStructure } from '@rds/shared';
import { Button } from '../../components/ui/Button';
import { Field, Input, Select } from '../../components/ui/Form';
import { Icon } from '../../components/ui/Icon';
import { blankField } from '../records/recordFormState';

export function ProcessEditor({ process, onChange, onAdd, onRemove, onMove, allowProcessChanges = true }: { process: ProcessStructure; onChange: (process: ProcessStructure) => void; onAdd: () => void; onRemove: () => void; onMove: (direction: -1 | 1) => void; allowProcessChanges?: boolean }) {
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= process.fields.length) return;
    const fields = [...process.fields];
    [fields[index], fields[target]] = [fields[target]!, fields[index]!];
    onChange({ ...process, fields: fields.map((field, fieldIndex) => ({ ...field!, sortOrder: fieldIndex })) });
  };
  return <div className="border-t border-ink-100 bg-ink-50/50 p-4 sm:p-5">
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end">
      <Field label="工序名称" className="flex-1"><Input value={process.name} disabled={!allowProcessChanges} onChange={(e) => onChange({ ...process, name: e.target.value })} /></Field>
      {allowProcessChanges && <div className="flex flex-wrap gap-2"><Button variant="ghost" className="px-3" icon="arrowUp" onClick={() => onMove(-1)} aria-label="上移工序" /><Button variant="ghost" className="px-3" icon="arrowDown" onClick={() => onMove(1)} aria-label="下移工序" /><Button variant="secondary" icon="plus" onClick={onAdd}>新增工序</Button><Button variant="ghost" icon="trash" className="text-danger-700" onClick={onRemove}>删除工序</Button></div>}
    </div>
    <div className="space-y-3">{process.fields.map((field,index) => <div key={field.id} className="rounded-xl border border-ink-100 bg-white p-3">
      <div className="grid gap-3 md:grid-cols-[1fr_100px_120px_auto]">
        <Field label="字段名称"><Input value={field.name} onChange={(e) => onChange({ ...process, fields: process.fields.map((item) => item.id === field.id ? { ...item, name: e.target.value } : item) })} placeholder="如：压制压力" /></Field>
        <Field label="单位"><Input value={field.unit} onChange={(e) => onChange({ ...process, fields: process.fields.map((item) => item.id === field.id ? { ...item, unit: e.target.value } : item) })} placeholder="如：MPa" /></Field>
        <Field label="数据类型"><Select value={field.valueType} onChange={(e) => onChange({ ...process, fields: process.fields.map((item) => item.id === field.id ? { ...item, valueType: e.target.value as typeof field.valueType } : item) })}><option value="number">数值</option><option value="text">文本</option><option value="date">日期</option></Select></Field>
        <div className="flex items-end gap-1"><Button variant="ghost" className="px-2" disabled={index === 0} onClick={() => move(index,-1)} aria-label="上移字段"><Icon name="arrowUp" size={17} /></Button><Button variant="ghost" className="px-2" disabled={index === process.fields.length-1} onClick={() => move(index,1)} aria-label="下移字段"><Icon name="arrowDown" size={17} /></Button><Button variant="ghost" className="px-2 text-danger-700" onClick={() => onChange({ ...process, fields: process.fields.filter((item) => item.id !== field.id) })} aria-label="删除字段"><Icon name="trash" size={17} /></Button></div>
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-3"><label className="flex min-h-touch items-center gap-2 text-xs text-ink-600"><input type="checkbox" className="h-4 w-4 accent-brand-700" checked={field.required} onChange={(e) => onChange({ ...process, fields: process.fields.map((item) => item.id === field.id ? { ...item, required: e.target.checked } : item) })} />必填</label>{field.valueType === 'number' && <><Field label="最小参考值"><Input type="number" className="w-32" value={field.minValue ?? ''} onChange={(e) => onChange({ ...process, fields: process.fields.map((item) => item.id === field.id ? { ...item, minValue: e.target.value === '' ? null : Number(e.target.value) } : item) })} /></Field><Field label="最大参考值"><Input type="number" className="w-32" value={field.maxValue ?? ''} onChange={(e) => onChange({ ...process, fields: process.fields.map((item) => item.id === field.id ? { ...item, maxValue: e.target.value === '' ? null : Number(e.target.value) } : item) })} /></Field></>}</div>
    </div>)}</div>
    <Button variant="secondary" icon="plus" className="mt-3" onClick={() => onChange({ ...process, fields: [...process.fields, blankField(process.fields.length)] })}>添加数据类别</Button>
  </div>;
}
