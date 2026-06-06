import { chromium } from "playwright";

/**
 * Scrapes the plain text content of a dynamic webpage using a headless Playwright Chromium instance.
 * Automatically handles common headers and viewport configuration to bypass simple bot detection.
 */
export async function scrapeUrlWithPlaywright(url: string): Promise<string> {
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-blink-features=AutomationControlled",
      ],
    });

    const context = await browser.newContext({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 1,
    });

    const page = await context.newPage();
    
    // Add extra headers to look like a real browser
    await page.setExtraHTTPHeaders({
      "Accept-Language": "en-US,en;q=0.9",
    });

    // Navigate to the target page and wait for it to load completely
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    // Wait for the body tag to be visible
    await page.waitForSelector("body", { timeout: 10000 });

    // Wait a brief moment for dynamic scripts to run (e.g. hydrate React components)
    await page.waitForTimeout(2000);

    // Extract raw text from the page body
    const pageText = await page.evaluate(() => {
      // Clean up scripts, styles, iframe content, navbars, and footers if possible to get pure text content
      const elementsToClean = document.querySelectorAll("script, style, iframe, nav, footer, header");
      elementsToClean.forEach(el => el.remove());
      return document.body.innerText || "";
    });

    await context.close();
    await browser.close();

    // Clean up excessive whitespace
    return pageText.replace(/\s{2,}/g, " ").trim();
  } catch (error) {
    console.error("[PLAYWRIGHT_SCRAPER] Scraping failed:", error);
    if (browser) {
      try {
        await browser.close();
      } catch (closeError) {
        console.error("[PLAYWRIGHT_SCRAPER] Failed to close browser:", closeError);
      }
    }
    throw error;
  }
}
