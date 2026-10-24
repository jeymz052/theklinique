-- Credentials and host tokens stay on the application server, never in this table.
begin;
alter table public.consultation_settings
  add column if not exists video_mode text not null default 'link',
  add column if not exists zoom_meeting_number text not null default '';
alter table public.consultation_settings
  add constraint consultation_video_mode_check check (video_mode in ('link', 'zoom')),
  add constraint consultation_zoom_number_check check (zoom_meeting_number = '' or zoom_meeting_number ~ '^[0-9]{9,11}$');
commit;
