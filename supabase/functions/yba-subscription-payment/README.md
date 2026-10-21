# YBA subscription payment receipt flow

This is a separate Edge Function. It does not edit `tg-bot`, `yba-parent-api`, `yba-public-parent-bot`, or the public introduction Mini App.

## Setup order

1. Review and apply `supabase/migrations/20261021100000_yba_subscription_payment_receipts.sql`.
2. Deploy only `yba-subscription-payment` with JWT verification enabled.
3. Confirm the project already has `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` (or `SUPABASE_PUBLISHABLE_KEYS`), and `YBA_PUBLIC_BOT_TOKEN` available to Edge Functions. This change adds no secrets and does not change existing secret values.
4. Refresh the CRM. The action appears to managers on consented introduction results. Select cash or card and confirm only after receiving the cash or checking the transfer in the bank app.

The Edge Function verifies the CRM user and `crm_is_manager()`, reads the Telegram user ID from the consented result row, records the fixed 99,000 UZS payment and 30-day term, then sends an informational Telegram receipt. Failed delivery remains visible in the CRM and can be retried. The message explicitly says it is not a fiscal receipt.

This flow records payment and subscription dates; it does not yet gate or unlock the four learning modules, and it does not create an official fiscal receipt. Those require the paid learning Mini App and the fiscal service to be connected separately. No paid-platform URL is sent until that platform exists.

