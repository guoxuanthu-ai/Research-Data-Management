# SQL migrations

按文件名顺序执行且仅执行一次。已应用到任何环境的 migration 不得修改；结构演进必须新增递增文件。执行器使用 `schema_migrations` 记录版本，所有语句使用 InnoDB 与 UTC 时间。

```bash
DATABASE_URL=mysql://root@127.0.0.1:3307/rds npm run db:migrate
DATABASE_URL=mysql://root@127.0.0.1:3307/rds npm run db:seed
```
