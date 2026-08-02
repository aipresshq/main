export type AuthorReference = string | { id: string } | { slug: string };

export function getAuthorId(reference: AuthorReference): string {
  if (typeof reference === 'string') return reference;
  return 'id' in reference ? reference.id : reference.slug;
}
