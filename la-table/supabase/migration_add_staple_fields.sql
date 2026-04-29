-- Add emoji and category columns to staples (run once in SQL editor)
alter table staples
  add column if not exists emoji    text not null default '🛍️',
  add column if not exists category text not null default 'Autres';
