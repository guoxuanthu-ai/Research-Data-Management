CREATE TABLE lifecycle_records (
  id CHAR(36) NOT NULL PRIMARY KEY,
  subject_type ENUM('product','experiment') NOT NULL,
  subject_id CHAR(36) NOT NULL,
  record_no INT NOT NULL,
  created_by CHAR(36) NOT NULL,
  updated_by CHAR(36) NOT NULL,
  version INT NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  deleted_by CHAR(36) NULL,
  UNIQUE KEY uniq_lifecycle_record_no(subject_type,subject_id,record_no),
  INDEX idx_lifecycle_subject(subject_type,subject_id,deleted_at,record_no),
  INDEX idx_lifecycle_creator(created_by,created_at),
  CONSTRAINT fk_lifecycle_creator FOREIGN KEY(created_by) REFERENCES users(id),
  CONSTRAINT fk_lifecycle_updater FOREIGN KEY(updated_by) REFERENCES users(id),
  CONSTRAINT fk_lifecycle_deleter FOREIGN KEY(deleted_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

ALTER TABLE records
  ADD COLUMN lifecycle_id CHAR(36) NULL AFTER id,
  ADD COLUMN stage_key ENUM('powder','pressing','heat_treatment') NULL AFTER lifecycle_id,
  ADD UNIQUE KEY uniq_lifecycle_stage(lifecycle_id,stage_key),
  ADD CONSTRAINT fk_records_lifecycle FOREIGN KEY(lifecycle_id) REFERENCES lifecycle_records(id);

ALTER TABLE products ADD COLUMN template_id CHAR(36) NULL AFTER name;
ALTER TABLE experiments ADD COLUMN template_id CHAR(36) NULL AFTER name;

INSERT INTO templates(id,name,description,created_by,updated_by)
SELECT UUID(),CONCAT('迁移模板-product-',p.id),'旧记录结构确定性迁移；每个旧主体独立模板',p.created_by,p.updated_by FROM products p;

INSERT INTO templates(id,name,description,created_by,updated_by)
SELECT UUID(),CONCAT('迁移模板-experiment-',e.id),'旧记录结构确定性迁移；每个旧主体独立模板',e.created_by,e.updated_by FROM experiments e;

UPDATE products p JOIN templates t ON t.name=CONCAT('迁移模板-product-',p.id) SET p.template_id=t.id;
UPDATE experiments e JOIN templates t ON t.name=CONCAT('迁移模板-experiment-',e.id) SET e.template_id=t.id;

INSERT INTO template_processes(id,template_id,process_def_id,name,sort_order)
SELECT UUID(),p.template_id,pd.id,stage.name,stage.sort_order FROM products p
JOIN (SELECT 'powder' AS stage_key,'粉料' AS name,10 AS sort_order UNION ALL SELECT 'pressing','压制',20 UNION ALL SELECT 'heat_treatment','热处理',30) stage
LEFT JOIN process_defs pd ON pd.name=stage.name;

INSERT INTO template_processes(id,template_id,process_def_id,name,sort_order)
SELECT UUID(),e.template_id,pd.id,stage.name,stage.sort_order FROM experiments e
JOIN (SELECT 'powder' AS stage_key,'粉料' AS name,10 AS sort_order UNION ALL SELECT 'pressing','压制',20 UNION ALL SELECT 'heat_treatment','热处理',30) stage
LEFT JOIN process_defs pd ON pd.name=stage.name;

INSERT INTO template_fields(id,template_process_id,name,unit,value_type,required,min_value,max_value,sort_order)
SELECT UUID(),tp.id,canonical.name,canonical.unit,canonical.value_type,canonical.required,canonical.min_value,canonical.max_value,canonical.sort_order
FROM template_processes tp
JOIN (
  SELECT r.subject_type,r.subject_id,
    CASE WHEN pd.name IN ('粉料','造粒') OR r.process_name IN ('粉料','造粒') THEN '粉料'
      WHEN pd.name='压制' OR r.process_name='压制' THEN '压制'
      WHEN pd.name IN ('热处理','烧结') OR r.process_name IN ('热处理','烧结') THEN '热处理' END AS process_name,
    rf.name,rf.unit,rf.value_type,rf.required,rf.min_value,rf.max_value,MIN(rf.sort_order) AS sort_order,MIN(rf.id) AS first_field_id
  FROM records r JOIN record_fields rf ON rf.record_id=r.id
  LEFT JOIN process_defs pd ON pd.id=r.process_def_id
  GROUP BY r.subject_type,r.subject_id,CASE WHEN pd.name IN ('粉料','造粒') OR r.process_name IN ('粉料','造粒') THEN '粉料'
    WHEN pd.name='压制' OR r.process_name='压制' THEN '压制'
    WHEN pd.name IN ('热处理','烧结') OR r.process_name IN ('热处理','烧结') THEN '热处理' END,rf.name,rf.unit,rf.value_type,rf.required,rf.min_value,rf.max_value
) canonical ON canonical.process_name=tp.name
JOIN templates t ON t.id=tp.template_id AND t.name=CONCAT('迁移模板-',canonical.subject_type,'-',canonical.subject_id)
WHERE canonical.process_name IS NOT NULL
  AND canonical.first_field_id=(SELECT MIN(rf2.id) FROM records r2 JOIN record_fields rf2 ON rf2.record_id=r2.id LEFT JOIN process_defs pd2 ON pd2.id=r2.process_def_id
    WHERE r2.subject_type=canonical.subject_type AND r2.subject_id=canonical.subject_id AND rf2.name=canonical.name
      AND (CASE WHEN pd2.name IN ('粉料','造粒') OR r2.process_name IN ('粉料','造粒') THEN '粉料'
        WHEN pd2.name='压制' OR r2.process_name='压制' THEN '压制'
        WHEN pd2.name IN ('热处理','烧结') OR r2.process_name IN ('热处理','烧结') THEN '热处理' END)=canonical.process_name);

INSERT INTO template_fields(id,template_process_id,name,unit,value_type,required,min_value,max_value,sort_order)
SELECT UUID(),target.id,source.name,source.unit,source.value_type,source.required,source.min_value,source.max_value,source.sort_order
FROM template_processes target
JOIN templates target_template ON target_template.id=target.template_id AND target_template.name LIKE '迁移模板-%'
JOIN template_processes source_process ON source_process.name=target.name
JOIN templates source_template ON source_template.id=source_process.template_id AND source_template.name='铜铁共烧电感标准模板'
JOIN template_fields source ON source.template_process_id=source_process.id
WHERE NOT EXISTS (SELECT 1 FROM template_fields existing WHERE existing.template_process_id=target.id);

INSERT INTO lifecycle_records(id,subject_type,subject_id,record_no,created_by,updated_by,version,created_at,updated_at,deleted_at,deleted_by)
SELECT r.id,r.subject_type,r.subject_id,
  ROW_NUMBER() OVER(PARTITION BY r.subject_type,r.subject_id ORDER BY r.created_at,r.id),r.created_by,r.updated_by,r.version,r.created_at,r.updated_at,r.deleted_at,r.deleted_by
FROM records r;

UPDATE records SET lifecycle_id=id;

UPDATE records r LEFT JOIN process_defs pd ON pd.id=r.process_def_id
SET r.stage_key=CASE WHEN pd.name IN ('粉料','造粒') OR r.process_name IN ('粉料','造粒') THEN 'powder'
  WHEN pd.name='压制' OR r.process_name='压制' THEN 'pressing'
  WHEN pd.name IN ('热处理','烧结') OR r.process_name IN ('热处理','烧结') THEN 'heat_treatment' ELSE NULL END;

UPDATE records r JOIN products p ON r.subject_type='product' AND p.id=r.subject_id
SET r.source_template_id=p.template_id,r.source_template_version=1 WHERE r.stage_key IS NOT NULL;
UPDATE records r JOIN experiments e ON r.subject_type='experiment' AND e.id=r.subject_id
SET r.source_template_id=e.template_id,r.source_template_version=1 WHERE r.stage_key IS NOT NULL;

UPDATE record_fields rf JOIN records r ON r.id=rf.record_id
JOIN products p ON r.subject_type='product' AND p.id=r.subject_id
JOIN template_processes tp ON tp.template_id=p.template_id AND tp.name=CASE r.stage_key WHEN 'powder' THEN '粉料' WHEN 'pressing' THEN '压制' WHEN 'heat_treatment' THEN '热处理' END
JOIN template_fields tf ON tf.template_process_id=tp.id AND tf.name=rf.name
SET rf.source_template_field_id=tf.id WHERE r.stage_key IS NOT NULL;

UPDATE record_fields rf JOIN records r ON r.id=rf.record_id
JOIN experiments e ON r.subject_type='experiment' AND e.id=r.subject_id
JOIN template_processes tp ON tp.template_id=e.template_id AND tp.name=CASE r.stage_key WHEN 'powder' THEN '粉料' WHEN 'pressing' THEN '压制' WHEN 'heat_treatment' THEN '热处理' END
JOIN template_fields tf ON tf.template_process_id=tp.id AND tf.name=rf.name
SET rf.source_template_field_id=tf.id WHERE r.stage_key IS NOT NULL;

ALTER TABLE products MODIFY COLUMN template_id CHAR(36) NOT NULL,
  ADD CONSTRAINT fk_products_template FOREIGN KEY(template_id) REFERENCES templates(id);
ALTER TABLE experiments MODIFY COLUMN template_id CHAR(36) NOT NULL,
  ADD CONSTRAINT fk_experiments_template FOREIGN KEY(template_id) REFERENCES templates(id);
