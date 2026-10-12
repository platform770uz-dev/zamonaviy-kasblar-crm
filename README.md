# Zamonaviy Kasblar CRM

A simple, responsive CRM for desktop and mobile.

## Features

- Telegram Mini App sign-in through the existing crm-telegram-login Supabase Edge Function.
- Candidate applications with search, stages, phone links, and internal notes.
- Orders, order details, and one-time signing links.
- A separate signing page for order owners.

## Security and setup

The browser uses only the Supabase publishable key. It does not include a service-role key or Telegram bot token. Candidate data is protected by Supabase authentication and row-level security.

The static HTML intentionally does not contain contractor tax, bank, or phone details. Add or deliver those through an authenticated server flow before using the signing page for production contracts.

The candidate workflow migration is in supabase/migrations/20261012_meta_admin_leads_crm_fields.sql. Review it and apply it to Supabase before using pipeline stages and internal notes; it is not applied automatically.

The existing Supabase Edge Functions allow the GitHub Pages origin https://platform770uz-dev.github.io. Configure GitHub Pages to publish the main branch from the repository root. The expected site URL is https://platform770uz-dev.github.io/zamonaviy-kasblar-crm/.

The Telegram bot still needs to be pointed to that URL separately. Do not enable production use until the project's data-region requirements have been verified.
