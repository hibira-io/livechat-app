#!/bin/bash
exec env ENVIRONMENT=development STANDALONE_MODE=true LOG_FORMAT=text \
 PUSHER_APP_ID=local-app PUSHER_APP_KEY=local-key PUSHER_APP_SECRET=local-secret-0123456789 \
 ADMIN_ENABLED=true SETUP_TOKEN=dev-setup-token-0123456789 \
 BILLING_ENABLED=true BILLING_PUBLIC_URL=http://localhost:8080 \
 LIVECHAT_ENABLED=true LIVECHAT_PUBLIC_URL=http://chat.localhost:8080 LIVECHAT_DEMO_AI=1 \
 ASSISTANT_MODEL=off "${LCDEMO:-./lcdemo}" serve
