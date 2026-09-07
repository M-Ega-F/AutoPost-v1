-- Additive platform expansion. Existing accounts, posts, RLS policies and
-- provider credentials remain unchanged.
ALTER TYPE public.platform ADD VALUE IF NOT EXISTS 'threads';
ALTER TYPE public.platform ADD VALUE IF NOT EXISTS 'linkedin';
ALTER TYPE public.platform ADD VALUE IF NOT EXISTS 'x';
