-- Editable public website content and media library.
create table if not exists public.landing_content (
  id smallint primary key default 1 check (id = 1),
  content jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

insert into public.landing_content (id, content) values (1, jsonb_build_object(
  'heroEyebrow', 'Skin · Aesthetics · Wellness',
  'heroTitle', 'Your Unique Beauty in Mind.',
  'heroSubtitle', 'Expert care. Natural results. A more confident you.',
  'heroDescription', 'At The Klinique, we combine medical expertise with a personalized approach to help you look and feel your best — inside and out.',
  'doctorEyebrow', 'Meet Your Doctor',
  'doctorName', 'Dr. Kharyl',
  'doctorTitle', 'Medical and Aesthetic Doctor',
  'doctorBio', 'Doctor-led, evidence-based aesthetic care shaped around your goals, comfort, and natural features.',
  'socialHeading', 'Latest from The Klinique',
  'socialPostUrl', 'https://www.facebook.com/61592051454777/videos/say-goodbye-to-skin-tags-for-good-clear-smooth-skin-is-just-a-visit-away-at-the-/1090401280642534/',
  'socialPosts', jsonb_build_array(
    jsonb_build_object('title', 'Latest from The Klinique', 'url', 'https://www.facebook.com/61592051454777/videos/say-goodbye-to-skin-tags-for-good-clear-smooth-skin-is-just-a-visit-away-at-the-/1090401280642534/', 'platform', 'facebook')
  ),
  'facebookPageUrl', 'https://web.facebook.com/profile.php?id=61592051454777',
  'instagramUrl', 'https://www.instagram.com/thekliniqueph',
  'aboutEyebrow', 'A Personalized Approach',
  'aboutTitle', 'Where Science Meets Self-Care',
  'aboutBody', 'We believe true beauty is unique to you. Our treatments are doctor-led, evidence-based, and tailored to your goals — for natural, refined results that enhance, not change, who you are.',
  'aboutImage', '/images/the klinique interior.jpg',
  'servicesEyebrow', 'Our Signature Services',
  'servicesTitle', 'What We Do Best',
  'serviceShowcase', jsonb_build_array(
    jsonb_build_object('name', 'Botox', 'tagline', 'Smoother. Fresher. More You.', 'image', '/images/botox.png', 'alt', 'Botox treatment'),
    jsonb_build_object('name', 'Fillers', 'tagline', 'Enhance Your Natural Beauty.', 'image', '/images/fillers.png', 'alt', 'Dermal fillers'),
    jsonb_build_object('name', 'Skin Boosters', 'tagline', 'Deep Hydration. Lasting Glow.', 'image', '/images/skin boosters.png', 'alt', 'Skin boosters'),
    jsonb_build_object('name', 'Lasers', 'tagline', 'Clearer Skin. Brighter You.', 'image', '/images/lasers.png', 'alt', 'Laser skin treatments')
  ),
  'quoteText', 'Healthy skin is a form of self-care.',
  'quoteSubtitle', 'Confidence · Wellness · A Brighter You',
  'contactEyebrow', 'Contact The Klinique',
  'contactTitle', 'Let’s talk about your goals',
  'contactBody', 'Send a message for treatment questions, package inquiries, or help with an existing appointment.',
  'phone', '+63 956 003 1916',
  'email', 'thekliniqueinfo@gmail.com',
  'address', 'Cagayan de Oro City, PH 9000',
  'clinicHours', 'By appointment only',
  'footerTagline', 'Your unique beauty in mind.',
  'faqs', jsonb_build_array(
    jsonb_build_object('question','Do I need a consultation before treatment?','answer','Some medical aesthetic procedures require an in-clinic assessment first.'),
    jsonb_build_object('question','How do I reserve an appointment?','answer','Choose your treatment, select an available slot, and complete the required reservation step.'),
    jsonb_build_object('question','Can I reschedule or cancel?','answer','Please notify the clinic at least 24 hours before your appointment.')
  ),
  'heroMedia', jsonb_build_array(
    jsonb_build_object('url', '/images/herobg.png', 'type', 'image', 'alt', 'The Klinique'),
    jsonb_build_object('url', '/images/botox.png', 'type', 'image', 'alt', 'Botox treatment'),
    jsonb_build_object('url', '/images/fillers.png', 'type', 'image', 'alt', 'Dermal fillers'),
    jsonb_build_object('url', '/images/skin boosters.png', 'type', 'image', 'alt', 'Skin boosters'),
    jsonb_build_object('url', '/images/lasers.png', 'type', 'image', 'alt', 'Laser treatments')
  ),
  'galleryMedia', jsonb_build_array(
    jsonb_build_object('url', '/images/Aesthetic Skincare Before and After Your Story.png', 'type', 'image', 'alt', 'Aesthetic skincare before and after'),
    jsonb_build_object('url', '/images/Fillers Before and After  (Instagram Post (45)) - 1.PNG', 'type', 'image', 'alt', 'Fillers before and after result one'),
    jsonb_build_object('url', '/images/Fillers Before and After  (Instagram Post (45)) - 2.PNG', 'type', 'image', 'alt', 'Fillers before and after result two')
  ),
  'galleryEyebrow', 'Before & After',
  'galleryTitle', 'Featured Results',
  'galleryDescription', 'Aesthetic transformations and clinic stories.',
  'galleryBadge', 'Results Board',
  'doctorPhoto', ''
)) on conflict (id) do nothing;

-- Backfill the multi-post social feed while preserving existing editor data.
update public.landing_content
set content = jsonb_set(content, '{socialPosts}', jsonb_build_array(
  jsonb_build_object(
    'title', coalesce(nullif(content->>'socialHeading', ''), 'Latest from The Klinique'),
    'url', coalesce(nullif(content->>'socialPostUrl', ''), 'https://www.facebook.com/61592051454777/videos/say-goodbye-to-skin-tags-for-good-clear-smooth-skin-is-just-a-visit-away-at-the-/1090401280642534/'),
    'platform', 'facebook'
  )
))
where not (content ? 'socialPosts');

-- Add editable gallery copy to an existing CMS row without overwriting edits.
update public.landing_content
set content = jsonb_build_object(
  'galleryEyebrow', 'Before & After',
  'galleryTitle', 'Featured Results',
  'galleryDescription', 'Aesthetic transformations and clinic stories.',
  'galleryBadge', 'Results Board'
) || content;

-- Backfill editable landing-page service cards for an existing CMS row.
update public.landing_content
set content = jsonb_set(content, '{serviceShowcase}', jsonb_build_array(
  jsonb_build_object('name', 'Botox', 'tagline', 'Smoother. Fresher. More You.', 'image', '/images/botox.png', 'alt', 'Botox treatment'),
  jsonb_build_object('name', 'Fillers', 'tagline', 'Enhance Your Natural Beauty.', 'image', '/images/fillers.png', 'alt', 'Dermal fillers'),
  jsonb_build_object('name', 'Skin Boosters', 'tagline', 'Deep Hydration. Lasting Glow.', 'image', '/images/skin boosters.png', 'alt', 'Skin boosters'),
  jsonb_build_object('name', 'Lasers', 'tagline', 'Clearer Skin. Brighter You.', 'image', '/images/lasers.png', 'alt', 'Laser skin treatments')
))
where not (content ? 'serviceShowcase');

-- Remove only the temporary service-image gallery seed from an earlier draft.
-- Staff-uploaded gallery media is never affected.
update public.landing_content
set content = jsonb_set(content, '{galleryMedia}', '[]'::jsonb)
where content->'galleryMedia' = jsonb_build_array(
  jsonb_build_object('url', '/images/botox.png', 'type', 'image', 'alt', 'Botox treatment'),
  jsonb_build_object('url', '/images/fillers.png', 'type', 'image', 'alt', 'Dermal fillers'),
  jsonb_build_object('url', '/images/skin boosters.png', 'type', 'image', 'alt', 'Skin boosters'),
  jsonb_build_object('url', '/images/lasers.png', 'type', 'image', 'alt', 'Laser treatments')
);

-- Give a new or still-empty gallery the clinic's initial before-and-after
-- feature set. Any existing staff-managed gallery is preserved.
update public.landing_content
set content = jsonb_set(content, '{galleryMedia}', jsonb_build_array(
  jsonb_build_object('url', '/images/Aesthetic Skincare Before and After Your Story.png', 'type', 'image', 'alt', 'Aesthetic skincare before and after'),
  jsonb_build_object('url', '/images/Fillers Before and After  (Instagram Post (45)) - 1.PNG', 'type', 'image', 'alt', 'Fillers before and after result one'),
  jsonb_build_object('url', '/images/Fillers Before and After  (Instagram Post (45)) - 2.PNG', 'type', 'image', 'alt', 'Fillers before and after result two')
))
where not (content ? 'galleryMedia')
   or jsonb_typeof(content->'galleryMedia') <> 'array'
   or jsonb_array_length(content->'galleryMedia') = 0;

-- Ensure the initial website visibly behaves as a carousel. This only replaces
-- the original single starter slide, never an editor-created multi-slide set.
update public.landing_content
set content = jsonb_set(content, '{heroMedia}', jsonb_build_array(
  jsonb_build_object('url', '/images/herobg.png', 'type', 'image', 'alt', 'The Klinique'),
  jsonb_build_object('url', '/images/botox.png', 'type', 'image', 'alt', 'Botox treatment'),
  jsonb_build_object('url', '/images/fillers.png', 'type', 'image', 'alt', 'Dermal fillers'),
  jsonb_build_object('url', '/images/skin boosters.png', 'type', 'image', 'alt', 'Skin boosters'),
  jsonb_build_object('url', '/images/lasers.png', 'type', 'image', 'alt', 'Laser treatments')
))
where jsonb_typeof(content->'heroMedia') = 'array'
  and jsonb_array_length(content->'heroMedia') < 2;

alter table public.landing_content enable row level security;
drop policy if exists "Public reads landing content" on public.landing_content;
create policy "Public reads landing content" on public.landing_content for select to anon, authenticated using (true);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('landing-media', 'landing-media', true, 52428800, array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public reads landing media" on storage.objects;
create policy "Public reads landing media" on storage.objects for select to anon, authenticated using (bucket_id = 'landing-media');
