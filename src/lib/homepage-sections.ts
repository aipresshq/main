export interface HomepagePost {
  id: string;
  data: {
    pubDate: Date;
    tags: string[];
    format: string;
    postType: string;
    featured: boolean;
  };
}

export interface HomepageSections<T extends HomepagePost> {
  stagePosts: T[];
  stagePicks: T[];
  latestPosts: T[];
  applicationsPosts: T[];
  usagePosts: T[];
  companyPosts: T[];
  relatedNews: T[];
  showcasePosts: T[];
  briefingPosts: T[];
  briefingFeature?: T;
  timelinePosts: T[];
  trackers: T[];
  digest: T[];
  newsroomPosts: T[];
}

const COMPANY_TAGS = new Set([
  'OpenAI',
  'Anthropic',
  'Google DeepMind',
  'Meta',
  'Microsoft',
  'Mistral',
]);
const DAY_MS = 86_400_000;

const utcDay = (date: Date) =>
  Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());

const sameEditorialDay = (a: Date, b: Date) => utcDay(a) === utcDay(b);

function selectDeskStories<T extends HomepagePost>(posts: T[]) {
  const used = new Set<string>();
  const takeFirst = (predicate: (post: T) => boolean) => {
    const selected = posts.find((post) => !used.has(post.id) && predicate(post));
    if (selected) used.add(selected.id);
    return selected ? [selected] : [];
  };

  const productLaunches = posts.some((post) => post.data.tags.includes('Product Launch'));
  const applicationsPosts = takeFirst((post) =>
    post.data.tags.includes(productLaunches ? 'Product Launch' : 'AI'),
  );
  const companyPosts = takeFirst((post) =>
    post.data.tags.some((tag) => COMPANY_TAGS.has(tag)),
  );
  const usagePosts = takeFirst((post) => post.data.postType === 'tracker');

  return { applicationsPosts, companyPosts, usagePosts };
}

export function selectRelatedPosts<T extends HomepagePost>(
  lead: T | undefined,
  posts: T[],
  limit = 6,
): T[] {
  if (!lead) return [];
  const leadTags = new Set(lead.data.tags);
  return posts
    .map((post, index) => ({
      post,
      index,
      sharedTags: post.data.tags.filter((tag) => leadTags.has(tag)).length,
    }))
    .filter(({ post, sharedTags }) => post.id !== lead.id && sharedTags > 0)
    .sort((a, b) => b.sharedTags - a.sharedTags || a.index - b.index)
    .slice(0, limit)
    .map(({ post }) => post);
}

export function selectHomepageSections<T extends HomepagePost>(posts: T[]): HomepageSections<T> {
  const storyCount = posts.length;
  const stageLimit = storyCount >= 24 ? 5 : 3;
  const stagePosts = posts.slice(0, stageLimit);
  const stageIds = new Set(stagePosts.map((post) => post.id));
  const stagePicks = posts
    .filter((post) => post.data.featured && !stageIds.has(post.id))
    .slice(0, 2);

  const latestLimit = storyCount >= 18 ? 6 : storyCount >= 6 ? 2 : 0;
  const latestPosts = posts.filter((post) => !stageIds.has(post.id)).slice(0, latestLimit);
  const { applicationsPosts, companyPosts, usagePosts } = selectDeskStories(posts);

  const lead = stagePosts[0];
  const relatedNews = selectRelatedPosts(lead, posts);
  const showcasePosts = posts.filter((post) => post.data.tags.includes('AI')).slice(0, 11);

  const briefingFeature = posts.find(
    (post) => post.data.format === 'explainer' || post.data.format === 'analysis',
  );
  const briefingPosts = posts
    .filter((post) => post.id !== briefingFeature?.id)
    .slice(0, 5);

  const newestDay = lead ? utcDay(lead.data.pubDate) : undefined;
  const oldestTimelineDay = newestDay === undefined ? undefined : newestDay - 6 * DAY_MS;
  const timelinePosts = posts
    .filter((post) => oldestTimelineDay !== undefined && utcDay(post.data.pubDate) >= oldestTimelineDay)
    .slice(0, 6);

  const trackers = posts.filter((post) => post.data.postType === 'tracker').slice(0, 5);
  const digest = lead
    ? posts
        .filter(
          (post) =>
            !stageIds.has(post.id) && sameEditorialDay(post.data.pubDate, lead.data.pubDate),
        )
        .slice(0, 8)
    : [];
  const newsroomPosts = posts.filter((post) => post.data.featured).slice(0, 6);

  return {
    stagePosts,
    stagePicks,
    latestPosts,
    applicationsPosts,
    usagePosts,
    companyPosts,
    relatedNews,
    showcasePosts,
    briefingPosts,
    briefingFeature,
    timelinePosts,
    trackers,
    digest,
    newsroomPosts,
  };
}
