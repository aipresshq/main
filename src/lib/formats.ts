export type StoryFormat =
  'brief' | 'explainer' | 'comparison' | 'tracker' | 'analysis' | 'tutorial';

export interface StoryFormatDefinition {
  key: StoryFormat;
  label: string;
  description: string;
}

export const storyFormats: StoryFormatDefinition[] = [
  {
    key: 'brief',
    label: 'News briefs',
    description: 'The essential development, with the context needed to orient quickly.',
  },
  {
    key: 'explainer',
    label: 'Explainers',
    description:
      'Clear background for a product, idea, or shift that deserves more than a headline.',
  },
  {
    key: 'comparison',
    label: 'Comparisons',
    description:
      'Workflow-led evaluations that make tradeoffs visible instead of naming one winner.',
  },
  {
    key: 'tracker',
    label: 'Trackers',
    description:
      'Living guides for limits, pricing, access, and product details that change over time.',
  },
  {
    key: 'analysis',
    label: 'Analysis',
    description: 'Reporting that separates evidence, interpretation, and what to watch next.',
  },
  {
    key: 'tutorial',
    label: 'Tutorials',
    description: 'Practical, step-by-step guidance for using AI tools responsibly and effectively.',
  },
];

export function getFormatDefinition(format: StoryFormat): StoryFormatDefinition {
  return storyFormats.find((entry) => entry.key === format) ?? storyFormats[0];
}

export function formatLabel(format: StoryFormat): string {
  return getFormatDefinition(format).label;
}
