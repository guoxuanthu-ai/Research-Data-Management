# 生产部署检查

- 使用 MySQL 8.0+，数据库和连接会话均为 UTC，业务展示时区为 Asia/Shanghai。
- 将 `.env.example` 复制到 `/etc/rds/api.env`，替换数据库密码和至少 32 字节随机 `JWT_SECRET`，权限设为 600。
- 执行 `npm ci`、共享包和 API 构建，再执行 `npm run db:migrate`；仅在需要演示账号时执行 dev seed。
- 修改 Nginx 域名、证书与部署路径，执行 `nginx -t` 后 reload；生产必须 `COOKIE_SECURE=true`。
- 启用 `research-data-api.service`，检查 `/api/v1/health` 和 systemd JSON 日志。
- 将 `backup.sh` 配置为每日 cron，备份目录与数据库分离，保留 30 天；每周用 `restore-check.sh` 演练恢复。
- 不删除历史 audit 与 migration；上线前验证首次改密、账号停用、刷新轮换和覆盖导入权限。
