import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { closeDb, execute, one, withTransaction, type Row } from '../infrastructure/db/client.js';
import { runMigrations } from '../infrastructure/db/migrationRunner.js';
import { hashPassword } from '../infrastructure/security/password.js';

const ids = {
  director: '00000000-0000-4000-8000-000000000001',
  supervisor: '00000000-0000-4000-8000-000000000002',
  engineer: '00000000-0000-4000-8000-000000000003',
  powder: '00000000-0000-4000-8000-000000000101',
  pressing: '00000000-0000-4000-8000-000000000102',
  sintering: '00000000-0000-4000-8000-000000000103',
  template: '00000000-0000-4000-8000-000000000201',
  product: '00000000-0000-4000-8000-000000000301',
  experiment: '00000000-0000-4000-8000-000000000302',
  record: '00000000-0000-4000-8000-000000000401',
};

export async function seed(): Promise<void> {
  await runMigrations();
  await withTransaction(async (tx) => {
    const accounts = [
      [ids.director, 'director', '厂长', 'director', 'Admin@123456', false, null],
      [ids.supervisor, 'supervisor', '研发主管', 'supervisor', 'Supervisor@123456', false, ids.director],
      [ids.engineer, 'engineer', '工程师', 'engineer', 'Engineer@123456', false, ids.director],
    ] as const;
    for (const [id, username, displayName, role, password, mustChange, creator] of accounts) {
      const exists = await one<Row[]>('SELECT id FROM users WHERE username = ?', [username], tx);
      if (exists) continue;
      await execute(`INSERT INTO users
        (id,username,display_name,role,password_hash,status,must_change_password,created_by,updated_by)
        VALUES (?,?,?,?,?,'active',?,?,?)`, [id, username, displayName, role, await hashPassword(password), mustChange, creator, creator], tx);
    }
    const processes = [[ids.powder, '粉料', 10], [ids.pressing, '压制', 20], [ids.sintering, '热处理', 30]] as const;
    for (const [id, name, sort] of processes) {
      await execute(`INSERT INTO process_defs(id,name,sort_order,is_system,created_by,updated_by)
        VALUES (?,?,?,TRUE,?,?) ON DUPLICATE KEY UPDATE is_system=TRUE,sort_order=VALUES(sort_order)`,
      [id, name, sort, ids.director, ids.director], tx);
    }
    const template = await one<Row[]>('SELECT id FROM templates WHERE id = ?', [ids.template], tx);
    if (!template) {
      await execute(`INSERT INTO templates(id,name,description,created_by,updated_by)
        VALUES (?,?,?,?,?)`, [ids.template, '铜铁共烧电感标准模板', '粉料、压制、热处理三段式标准字段', ids.director, ids.director], tx);
      const structures = [
        { id: randomUUID(), processId: ids.powder, name: '粉料', sort: 10, fields: [
          ['powder-size', '粉料粒度', 'μm', 'number', true, 0, null],
          ['powder-ratio', '粉料配比', '', 'text', true, null, null],
          ['tap-density', '振实密度', 'g/cm³', 'number', false, 0, 10],
        ] },
        { id: randomUUID(), processId: ids.pressing, name: '压制', sort: 20, fields: [
          ['pressing-pressure', '压制压力', 'MPa', 'number', true, 0, 500],
          ['green-density', '生坯密度', 'g/cm³', 'number', false, 0, 10],
          ['green-inductance', '生坯感量', 'μH', 'number', false, 0, null],
        ] },
        { id: randomUUID(), processId: ids.sintering, name: '热处理', sort: 30, fields: [
          ['sintering-curve', '烧结温度曲线', '', 'text', true, null, null],
          ['sintered-inductance', '烧结后感量', 'μH', 'number', false, 0, null],
          ['quality-factor', 'Q 值', '', 'number', false, 0, null],
          ['dc-resistance', '直流电阻', 'mΩ', 'number', false, 0, null],
        ] },
      ];
      for (const process of structures) {
        await execute('INSERT INTO template_processes(id,template_id,process_def_id,name,sort_order) VALUES (?,?,?,?,?)',
          [process.id, ids.template, process.processId, process.name, process.sort], tx);
        for (const [index, field] of process.fields.entries()) {
          const [, name, unit, type, required, min, max] = field;
          await execute(`INSERT INTO template_fields
            (id,template_process_id,name,unit,value_type,required,min_value,max_value,sort_order)
            VALUES (?,?,?,?,?,?,?,?,?)`, [randomUUID(), process.id, name, unit, type, required, min, max, (index + 1) * 10], tx);
        }
      }
    }
    const demoProduct = await one<Row[]>('SELECT id FROM products WHERE id = ?', [ids.product], tx);
    if (!demoProduct) {
      await execute(`INSERT INTO products(id,product_code,name,template_id,owner_id,remark,created_by,updated_by)
        VALUES (?,?,?,?,?,?,?,?)`, [ids.product, 'DEMO-CUFE-01', '铜铁共烧电感定型样件', ids.template, ids.engineer, '开发环境持久化演示产品', ids.engineer, ids.engineer], tx);
      await execute(`INSERT INTO experiments
        (id,experiment_no,name,template_id,purpose,owner_id,experiment_date,remark,created_by,updated_by)
        VALUES (?,?,?,?,?,?,?,?,?,?)`, [ids.experiment, 'EXP-20261024-001', '铜铁共烧工艺验证', ids.template, '验证烧结曲线对感量与 Q 值的影响', ids.engineer, '2026-10-24', '开发环境持久化演示实验', ids.engineer, ids.engineer], tx);
      await execute(`INSERT INTO experiment_sequences(seq_date,last_seq) VALUES ('2026-10-24',1)
        ON DUPLICATE KEY UPDATE last_seq=GREATEST(last_seq,1)`, [], tx);
      await execute(`INSERT INTO lifecycle_records(id,subject_type,subject_id,record_no,created_by,updated_by)
        VALUES (?,'experiment',?,1,?,?)`, [ids.record, ids.experiment, ids.engineer, ids.engineer], tx);
      await execute(`INSERT INTO records
        (id,lifecycle_id,stage_key,subject_type,subject_id,process_def_id,process_name,process_sort,source_template_id,source_template_version,created_by,updated_by)
        VALUES (?,?,'heat_treatment','experiment',?,?,?,?,?,1,?,?)`, [ids.record, ids.record, ids.experiment, ids.sintering, '热处理', 30, ids.template, ids.engineer, ids.engineer], tx);
      const fields = [
        ['00000000-0000-4000-8000-000000000501', '烧结温度曲线', '', 'text', true, null, null, 10, '25℃→780℃/2h→980℃/1h→自然冷却'],
        ['00000000-0000-4000-8000-000000000502', '烧结后感量', 'μH', 'number', false, 0, null, 20, '10.2'],
        ['00000000-0000-4000-8000-000000000503', 'Q 值', '', 'number', false, 0, null, 30, '48'],
        ['00000000-0000-4000-8000-000000000504', '直流电阻', 'mΩ', 'number', false, 0, null, 40, '65'],
      ] as const;
      for (const [id, name, unit, type, required, min, max, sort, value] of fields) {
        const source = await one<Row[]>('SELECT tf.id FROM template_fields tf JOIN template_processes tp ON tp.id=tf.template_process_id WHERE tp.template_id=? AND tf.name=?', [ids.template, name], tx);
        await execute(`INSERT INTO record_fields
          (id,record_id,source_template_field_id,name,unit,value_type,required,min_value,max_value,sort_order)
          VALUES (?,?,?,?,?,?,?,?,?,?)`, [id, ids.record, source?.id ?? null, name, unit, type, required, min, max, sort], tx);
        await execute(`INSERT INTO record_values
          (id,record_id,record_field_id,raw_value,value_number,value_text,value_date,entered_by,updated_by)
          VALUES (?,?,?,?,?,?,?,?,?)`, [randomUUID(), ids.record, id, value, type === 'number' ? Number(value) : null, type === 'text' ? value : null, null, ids.engineer, ids.engineer], tx);
      }
      await execute(`INSERT INTO audit_logs
        (id,request_id,actor_id,action,entity_type,entity_id,subject_type,subject_id,after_json)
        VALUES (?,'dev-seed',?,'create','lifecycle_record',?,'experiment',?,JSON_OBJECT('source','devSeed'))`,
      [randomUUID(), ids.engineer, ids.record, ids.experiment], tx);
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await seed();
    console.log('Seed complete: director / Admin@123456, supervisor / Supervisor@123456, engineer / Engineer@123456');
  } finally {
    await closeDb();
  }
}
