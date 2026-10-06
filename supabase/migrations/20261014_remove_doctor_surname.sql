update public.clinic_settings
set doctor_name = 'Dr. Kharyl'
where doctor_name ilike '%Kharyl%Dence%';

update public.landing_content
set content = jsonb_set(content, '{doctorName}', to_jsonb('Dr. Kharyl'::text), true)
where content ->> 'doctorName' ilike '%Kharyl%Dence%';

update public.profiles
set full_name = 'Dr. Kharyl'
where full_name ilike '%Kharyl%Dence%';
