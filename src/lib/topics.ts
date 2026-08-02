export interface TopicGroup {
  label: string;
  topics: string[];
}

/**
 * The site's canonical topic taxonomy, grouped by what actually helps a
 * reader browse — company, or coverage theme — rather than derived from
 * whatever tags happen to appear on posts. Topics exist here independently
 * of content, so a group like Tutorials can go live before any post uses it.
 */
export const topicGroups: TopicGroup[] = [
  {
    label: 'Companies',
    topics: ['OpenAI', 'Anthropic', 'Google DeepMind', 'Meta', 'Microsoft', 'Mistral'],
  },
  {
    label: 'Coverage',
    topics: ['AI', 'Comparisons', 'Funding', 'Product Launch', 'Research'],
  },
  {
    label: 'Tutorials',
    topics: ['Tutorials'],
  },
];

export const knownTopics = topicGroups.flatMap((group) => group.topics);
