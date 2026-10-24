begin;
-- Keep legacy columns for earlier migrations, but disable all link-based rooms.
update public.consultation_settings set video_mode = 'zoom', meeting_url = '';
alter table public.consultation_settings alter column video_mode set default 'zoom';
alter table public.consultation_settings
  add constraint consultation_embedded_zoom_only check (video_mode = 'zoom' and meeting_url = '');
commit;
