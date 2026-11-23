export interface HfRepoResult {
  id: string;
  type: 'dataset' | 'model';
  author?: string;
  description?: string;
  downloads: number;
  likes: number;
  tags: string[];
  lastModified?: string;
  url: string;
}

export async function searchHuggingFace(
  query: string,
  options: { type?: 'dataset' | 'model' | 'all'; limit?: number } = {}
): Promise<HfRepoResult[]> {
  const type = options.type || 'dataset';
  const limit = options.limit || 8;
  const results: HfRepoResult[] = [];

  const typesToFetch: ('datasets' | 'models')[] =
    type === 'all' ? ['datasets', 'models'] : type === 'dataset' ? ['datasets'] : ['models'];

  for (const t of typesToFetch) {
    try {
      const url = `https://huggingface.co/api/${t}?search=${encodeURIComponent(query)}&limit=${limit}&full=true`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'safe-skill/1.1' },
        signal: AbortSignal.timeout(8000)
      });
      if (!res.ok) continue;

      const items = (await res.json()) as any[];
      for (const item of items) {
        const repoType = t === 'datasets' ? 'dataset' : 'model';
        const repoId = item.id || item._id;
        if (!repoId) continue;

        results.push({
          id: repoId,
          type: repoType,
          author: item.author || repoId.split('/')[0],
          description: item.description || item.cardData?.description || item.summary || '',
          downloads: item.downloads || 0,
          likes: item.likes || 0,
          tags: Array.isArray(item.tags) ? item.tags.slice(0, 8) : [],
          lastModified: item.lastModified,
          url: `https://huggingface.co/${repoType === 'dataset' ? 'datasets/' : ''}${repoId}`
        });
      }
    } catch (err) {
      process.stderr.write(`[safe-skill] Hugging Face arama uyarısı (${t}): ${(err as Error).message}\n`);
    }
  }

  return results.sort((a, b) => (b.downloads + b.likes * 10) - (a.downloads + a.likes * 10));
}
