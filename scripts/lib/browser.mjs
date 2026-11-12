import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

export const root = fileURLToPath(new URL('../../', import.meta.url));

export function launchBrowser() {
  return chromium.launch({
    headless: true,
    ...(process.env.CHROME_PATH
      ? { executablePath: process.env.CHROME_PATH }
      : {}),
    args: ['--disable-background-timer-throttling']
  });
}

// Serve bundled assets inside an isolated browser context without a local server.
export async function routeApp(context, origin) {
  const appDirectory = path.join(root, 'app');
  await context.route(`${origin}/**`, async (route) => {
    try {
      const pathname = decodeURIComponent(
        new URL(route.request().url()).pathname
      );
      const filename = pathname === '/' ? 'index.html' : pathname.slice(1);
      const file = path.resolve(appDirectory, filename);
      if (!file.startsWith(appDirectory + path.sep)) {
        await route.fulfill({ status: 403, body: 'Forbidden' });
        return;
      }
      await route.fulfill({
        contentType:
          {
            '.html': 'text/html',
            '.js': 'text/javascript',
            '.css': 'text/css',
            '.png': 'image/png',
            '.jpg': 'image/jpeg'
          }[path.extname(file)] || 'application/octet-stream',
        body: await readFile(file)
      });
    } catch {
      await route.fulfill({ status: 404, body: 'Not found' });
    }
  });
}
