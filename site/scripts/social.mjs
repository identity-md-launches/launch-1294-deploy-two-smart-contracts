import { chromium } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const font = (
  await readFile(
    new URL(
      "../public/fonts/ibm-plex-mono-latin-600-normal.woff2",
      import.meta.url,
    ),
  )
).toString("base64");
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH || undefined,
});
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
  });
  await page.setContent(
    `<!doctype html><html><head><style>@font-face{font-family:Plex;src:url(data:font/woff2;base64,${font})}*{box-sizing:border-box}body{margin:0;background:#fff;color:#000;font:600 28px/1.55 Plex,monospace;padding:54px}header{display:flex;justify-content:space-between;border-bottom:2px solid #000;padding-bottom:24px}main{padding-top:72px}h1{font:inherit;font-size:44px;margin:0 0 20px}p{font:inherit;margin:0;color:#555}footer{margin-top:88px;border-top:2px solid #000;padding-top:20px;font-size:24px}</style></head><body><header><span>imd/acc</span><span>Sepolia test</span></header><main><h1>Trading cashback in staked IMD.</h1><p>App and integration docs.</p></main><footer>Sepolia test run 2 · 11155111</footer></body></html>`,
  );
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: fileURLToPath(new URL("../public/og.png", import.meta.url)),
    type: "png",
  });
} finally {
  await browser.close();
}
