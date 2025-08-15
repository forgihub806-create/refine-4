import { chromium, type Browser, type Page } from 'playwright';

export interface ScrapedMetadata {
  url: string;
  title: string;
  description?: string;
  thumbnail?: string;
  error?: string;
}

function normalizeUrl(url: string): string {
  try {
    const urlObject = new URL(url);
    const path = urlObject.pathname;
    const match = path.match(/\/s\/([a-zA-Z0-9_-]+)/);
    if (match && match[1]) {
      return `https://www.terabox.com/s/${match[1]}`;
    }
  } catch (error) {
    console.error(`Invalid URL: ${url}`, error);
  }
  return url; // Return original if normalization fails
}

async function scrapeSingle(url: string, browser: Browser): Promise<ScrapedMetadata> {
  const normalized = normalizeUrl(url);
  const page: Page = await browser.newPage();
  try {
    await page.goto(normalized, { waitUntil: 'networkidle' });

    // Allow time for dynamic JS content to render
    await page.waitForTimeout(2000);

    // Try title from multiple selectors + OG tags
    const title = await page.evaluate(() => {
      const selectors = [
        'h1',
        '.title',
        '.video-title',
        '.share-title'
      ];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el?.textContent?.trim()) return el.textContent.trim();
      }
      const ogTitle = document.querySelector('meta[property="og:title"]') as HTMLMetaElement;
      if (ogTitle?.content) return ogTitle.content.trim();
      return null;
    });

    if (!title) throw new Error('No title found');

    // Try description from selectors + OG meta
    const description = await page.evaluate(() => {
      const selectors = [
        '.description',
        '.desc',
        '#description'
      ];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el?.textContent?.trim()) return el.textContent.trim();
      }
      const ogDesc = document.querySelector('meta[property="og:description"]') as HTMLMetaElement;
      if (ogDesc?.content) return ogDesc.content.trim();
      return null;
    });

    // Try thumbnail from OG meta, video poster, or img
    const thumbnail = await page.evaluate(() => {
      const ogImage = document.querySelector('meta[property="og:image"]') as HTMLMetaElement;
      if (ogImage?.content) return ogImage.content;

      const videoPoster = document.querySelector('video') as HTMLVideoElement;
      if (videoPoster?.poster) return videoPoster.poster;

      const img = document.querySelector('img') as HTMLImageElement;
      if (img?.src) return img.src;

      return null;
    });

    return {
      url: normalized,
      title,
      description: description || undefined,
      thumbnail: thumbnail || undefined,
    };

  } catch (error: any) {
    return { url: normalized, title: '', error: error.message };
  } finally {
    await page.close();
  }
}

export async function scrapeWithPlaywright(urls: string[]): Promise<ScrapedMetadata[]> {
  const browser = await chromium.launch({ headless: true });
  const results: ScrapedMetadata[] = [];

  // Limit concurrency to avoid overload — batch size = 5
  const concurrency = 5;
  const batches = [];

  for (let i = 0; i < urls.length; i += concurrency) {
    batches.push(urls.slice(i, i + concurrency));
  }

  for (const batch of batches) {
    const batchResults = await Promise.all(batch.map(url => scrapeSingle(url, browser)));
    results.push(...batchResults);
  }

  await browser.close();
  return results;
}
