-- RoadShield AI — lets the push-dispatch Edge Function (service role only) check the shared
-- secret that the notifications trigger sends, without exposing the private settings table.
create or replace function public.verify_dispatch_secret(p_secret text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(p_secret, '') <> ''
     and exists (
       select 1 from app_private.settings s
       where s.key = 'push_dispatch_secret' and s.value = p_secret
     );
$$;

revoke execute on function public.verify_dispatch_secret(text) from public, anon, authenticated;
grant execute on function public.verify_dispatch_secret(text) to service_role;
