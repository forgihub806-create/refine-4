
import { chromium, type Browser, type Page } from 'playwright';

export interface ScrapedMetadata {
  title: string;
  description?: string;
  thumbnail?: string;
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
  return url; // Return original url if normalization fails
}


async function scrapeWithPlaywright(url: string): Promise<ScrapedMetadata | null> {
  let browser: Browser | null = null;
  try {
    const normalized = normalizeUrl(url);
    browser = await chromium.launch({ headless: true });
    const page: Page = await browser.newPage();
    await page.goto(normalized, { waitUntil: 'domcontentloaded' });

    // Wait for a plausible title element to ensure the page is loading
    await page.waitForSelector('h1, .title, .video-title', { timeout: 15000 });

    const title = await page.evaluate(() => {
      const titleElement = document.querySelector('h1, .title, .video-title');
      return titleElement ? titleElement.textContent?.trim() : null;
    });

    if (!title) {
      throw new Error('Could not find title element');
    }

    const description = await page.evaluate(() => {
      const descElement = document.querySelector('.description, .desc, #description');
      return descElement ? descElement.textContent?.trim() : null;
    });

    const thumbnail = await page.evaluate(() => {
      const ogImage = document.querySelector('meta[property="og:image"]');
      if (ogImage) {
        return ogImage.getAttribute('content');
      }
      const videoPoster = document.querySelector('video');
      if (videoPoster) {
        return videoPoster.getAttribute('poster');
      }
      return null;
    });

    return {
      title,
      description: description || undefined,
      thumbnail: thumbnail || undefined,
    };
  } catch (error) {
    console.error(`Failed to scrape ${url}:`, error);
    return null;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}


export { scrapeWithPlaywright, normalizeUrl };