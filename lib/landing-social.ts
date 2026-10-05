export const FEATURED_FACEBOOK_REEL = "https://www.facebook.com/61592051454777/videos/say-goodbye-to-skin-tags-for-good-clear-smooth-skin-is-just-a-visit-away-at-the-/1090401280642534/";

const LEGACY_FACEBOOK_PROFILE_ID = "61592051454777";
const FEATURED_REEL_SHARE_CODE = "1byfFgabjs";
const KNOWN_FACEBOOK_POSTS: Record<string, string> = {
  "/share/p/19pwcyj3eq": "https://www.facebook.com/permalink.php?story_fbid=pfbid0R75eyjZJqh6wpKckqDHppLBCmJGdEJpjL9g8uWKzepDMSmbZQQymrZ8ET7CVMxw3l&id=61592051454777",
  "/share/p/1huxtcvcuf": "https://www.facebook.com/permalink.php?story_fbid=pfbid0492U1nwjc5exmERkJs7rh7P4s4DTBAZRpG1mf13BxGUL9vV5X5Wm2prnppFEV31Cl&id=61592051454777",
};

export function normalizeFacebookPostUrl(value: string) {
  const url = value.trim();
  if (!url) return url;

  try {
    const parsed = new URL(url);
    if (!/(^|\.)facebook\.com$/i.test(parsed.hostname)) return url;

    const path = parsed.pathname.replace(/\/+$/, "");
    const isLegacyProfile = path.toLowerCase() === "/profile.php" && parsed.searchParams.get("id") === LEGACY_FACEBOOK_PROFILE_ID;
    const isFeaturedShareLink = path.toLowerCase() === `/share/r/${FEATURED_REEL_SHARE_CODE.toLowerCase()}`;
    const isFeaturedReel = /\/(reel|videos)\/.*1090401280642534$/i.test(path);
    const knownPost = KNOWN_FACEBOOK_POSTS[path.toLowerCase()];

    if (knownPost) return knownPost;
    return isLegacyProfile || isFeaturedShareLink || isFeaturedReel ? FEATURED_FACEBOOK_REEL : url;
  } catch {
    return url;
  }
}

export function isEmbeddableFacebookPost(value: string) {
  try {
    const parsed = new URL(value);
    if (!/(^|\.)facebook\.com$/i.test(parsed.hostname)) return false;

    const path = parsed.pathname.replace(/\/+$/, "");
    return /\/(posts|videos|reel|photos|share)\/[^/]+/i.test(path)
      || /\/(permalink|photo|story)\.php$/i.test(path)
      || parsed.searchParams.has("story_fbid")
      || parsed.searchParams.has("fbid");
  } catch {
    return false;
  }
}

export function isFacebookVideo(value: string) {
  try {
    const parsed = new URL(value);
    return /(^|\.)facebook\.com$/i.test(parsed.hostname)
      && (/\/(videos|reel)\/[^/]+/i.test(parsed.pathname) || /\/share\/(r|v)\/[^/]+/i.test(parsed.pathname));
  } catch {
    return false;
  }
}

export function getInstagramEmbedUrl(value: string) {
  try {
    const parsed = new URL(value);
    if (!/(^|\.)instagram\.com$/i.test(parsed.hostname)) return null;

    const match = parsed.pathname.match(/^\/(p|reel|tv)\/([A-Za-z0-9_-]+)/i);
    if (!match) return null;
    return `https://www.instagram.com/${match[1].toLowerCase()}/${match[2]}/embed/`;
  } catch {
    return null;
  }
}

export function normalizeLandingSocialContent<T extends { socialPostUrl?: string; socialPosts?: Array<{ url: string }> }>(content: T): T {
  return {
    ...content,
    socialPostUrl: content.socialPostUrl ? normalizeFacebookPostUrl(content.socialPostUrl) : content.socialPostUrl,
    socialPosts: content.socialPosts?.map((post) => ({ ...post, url: normalizeFacebookPostUrl(post.url) })),
  };
}
