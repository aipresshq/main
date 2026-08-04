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
    topics: ['AI', 'Comparisons', 'Funding', 'Policy & Regulation', 'Product Launch', 'Research'],
  },
  {
    label: 'Tutorials',
    topics: ['Tutorials'],
  },
];

export const knownTopics = topicGroups.flatMap((group) => group.topics);

export const topicDescriptions: Record<string, string> = {
  OpenAI:
    'Reporting on OpenAI models, products, research, pricing, and the decisions behind each release.',
  Anthropic:
    'Coverage of Anthropic models, safety work, research, and the products built around Claude.',
  'Google DeepMind':
    'The latest on Google DeepMind research, Gemini models, and practical AI products.',
  Meta: 'Analysis of Meta AI models, open-weight releases, products, and the infrastructure behind them.',
  Microsoft:
    'Coverage of Microsoft AI products, Copilot, partnerships, and the systems used at work.',
  Mistral:
    "Reporting on Mistral models, open releases, funding, and the company's place in the AI market.",
  AI: 'Clear reporting on the models, companies, products, and research shaping artificial intelligence.',
  Comparisons:
    'Practical comparisons that make differences in capability, workflow, and cost easier to evaluate.',
  Funding: 'The money, partnerships, and business decisions moving the AI industry forward.',
  'Policy & Regulation':
    'Coverage of the rules, governance decisions, and public debates shaping AI deployment.',
  'Product Launch':
    'New model and product launches, with the context needed to understand what changed.',
  Research:
    'Research developments translated into useful context, limitations, and questions worth checking.',
  Tutorials:
    'Step-by-step guides for using AI tools carefully, efficiently, and with clear expectations.',
};

export function getTopicDescription(topic: string) {
  return (
    topicDescriptions[topic] ??
    `AIPressHQ reporting on ${topic}, with practical context and the sources behind each story.`
  );
}
