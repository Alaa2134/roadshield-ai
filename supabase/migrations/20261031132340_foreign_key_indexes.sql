-- Covering indexes for foreign keys flagged by the Supabase performance advisor.
-- They speed up joins and the ON DELETE actions that run when an account is deleted.
create index if not exists ai_detections_requested_by_idx on public.ai_detections (requested_by);
create index if not exists hazard_images_task_idx on public.hazard_images (task_id) where task_id is not null;
create index if not exists hazard_images_uploader_idx on public.hazard_images (uploader_id);
create index if not exists hazards_ai_detection_idx on public.hazards (ai_detection_id) where ai_detection_id is not null;
create index if not exists hazards_duplicate_of_idx on public.hazards (duplicate_of) where duplicate_of is not null;
create index if not exists hazards_reviewed_by_idx on public.hazards (reviewed_by) where reviewed_by is not null;
create index if not exists maintenance_tasks_assigned_by_idx on public.maintenance_tasks (assigned_by);
create index if not exists status_history_changed_by_idx on public.status_history (changed_by);
create index if not exists task_updates_author_idx on public.task_updates (author_id);
create index if not exists user_roles_granted_by_idx on public.user_roles (granted_by) where granted_by is not null;
