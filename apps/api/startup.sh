#!/bin/sh
# Production entry point (Azure App Service and Docker): migrate, then serve.
set -e
alembic upgrade head
exec gunicorn chizma_api.main:app \
  --workers 1 \
  --worker-class uvicorn.workers.UvicornWorker \
  --bind "0.0.0.0:${PORT:-8000}" \
  --timeout 120 \
  --access-logfile -
