-- RoadShield AI — table and column privileges (writes go through RPCs)

-- Anonymous visitors get nothing; signed-in users get read access shaped by policies.
-- All workflow writes go through SECURITY DEFINER functions that validate role and state.
revoke all on all tables in schema public from anon;
revoke insert, update, delete, truncate on all tables in schema public from authenticated;
grant select on all tables in schema public to authenticated;
revoke all on all sequences in schema public from anon, authenticated;

grant update (full_name, avatar_path, locale, home_city, notify_status_updates,
              notify_nearby, notify_announcements, nearby_radius_m)
  on public.profiles to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant delete on public.notifications to authenticated;
grant delete on public.device_push_tokens to authenticated;
grant insert (label, latitude, longitude, user_id) on public.saved_locations to authenticated;
grant update (label) on public.saved_locations to authenticated;
grant delete on public.saved_locations to authenticated;

