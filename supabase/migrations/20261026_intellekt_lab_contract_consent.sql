alter table public.intellekt_lab_results
  alter column consent_version drop not null,
  alter column consent_text drop not null,
  alter column consent_at drop not null,
  alter column consent_at drop default;
