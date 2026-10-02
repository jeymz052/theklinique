-- Replace only the original profile-link social seed with the featured Reel.
-- Staff-managed social posts and the clinic's Facebook page link are preserved.
update public.landing_content
set content = jsonb_set(
  jsonb_set(content, '{socialPostUrl}', to_jsonb('https://www.facebook.com/61592051454777/videos/say-goodbye-to-skin-tags-for-good-clear-smooth-skin-is-just-a-visit-away-at-the-/1090401280642534/'::text)),
  '{socialPosts}',
  jsonb_build_array(
    jsonb_build_object(
      'title', 'Latest from The Klinique',
      'url', 'https://www.facebook.com/61592051454777/videos/say-goodbye-to-skin-tags-for-good-clear-smooth-skin-is-just-a-visit-away-at-the-/1090401280642534/',
      'platform', 'facebook'
    )
  )
)
where content->>'socialPostUrl' = 'https://web.facebook.com/profile.php?id=61592051454777'
   or content->>'socialPostUrl' = 'https://web.facebook.com/share/r/1byfFgabjs/'
   or content->>'socialPostUrl' = 'https://www.facebook.com/reel/1090401280642534/'
   or content->'socialPosts' = jsonb_build_array(
     jsonb_build_object(
       'title', 'Latest from The Klinique',
       'url', 'https://web.facebook.com/profile.php?id=61592051454777',
       'platform', 'facebook'
     )
   )
   or content->'socialPosts' = jsonb_build_array(
     jsonb_build_object(
       'title', 'Latest from The Klinique',
       'url', 'https://web.facebook.com/share/r/1byfFgabjs/',
       'platform', 'facebook'
     )
   )
   or content->'socialPosts' = jsonb_build_array(
     jsonb_build_object(
       'title', 'Latest from The Klinique',
       'url', 'https://www.facebook.com/reel/1090401280642534/',
       'platform', 'facebook'
     )
   );
