-- Live updates for the app: in-app notifications, hazard status changes and report timelines.
-- Realtime postgres_changes respects RLS, so each user only receives rows they can read.
alter publication supabase_realtime add table public.notifications;
alter publication supabase_realtime add table public.hazards;
alter publication supabase_realtime add table public.status_history;
