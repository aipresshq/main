import * as prismic from '@prismicio/client';
import { PRISMIC_REPOSITORY_NAME, PRISMIC_LOCALE, PRISMIC_POST_TYPE } from '../src/loaders/prismic-fields.ts';

export { PRISMIC_LOCALE, PRISMIC_POST_TYPE };

export function createPrismicClient() {
  return prismic.createClient(PRISMIC_REPOSITORY_NAME);
}

export function createPrismicWriteClient() {
  const writeToken = process.env.PRISMIC_WRITE_TOKEN;
  if (!writeToken) {
    throw new Error(
      'PRISMIC_WRITE_TOKEN is not set. Run with `node --env-file=.env ...` after setting it in .env.',
    );
  }
  return prismic.createWriteClient(PRISMIC_REPOSITORY_NAME, { writeToken });
}
