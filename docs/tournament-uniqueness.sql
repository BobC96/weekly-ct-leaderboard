-- Already applied by the owner in Supabase on 2026-10-04.
-- Reference for new databases, not a request to rerun on production.
-- Requires resolving existing name/date duplicates first.
CREATE UNIQUE INDEX tournaments_unique_name_date
ON public.tournaments (tournament_date, lower(trim(name)));
