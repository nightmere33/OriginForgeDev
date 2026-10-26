// Print /en/cv and /fr/cv to A4 PDFs in public/cv/ with the installed Chrome.
//   npm run cv:pdf            (needs the dev or production server running)
//   CV_BASE_URL=https://… npm run cv:pdf
import { chromium } from "@playwright/test";

const base = process.env.CV_BASE_URL ?? "http://localhost:3000";
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage();
// Keep dev-only overlays out of the print.
await page.addInitScript(() => localStorage.setItem("of:no-devtools", "1"));
for (const lang of ["en", "fr"]) {
  await page.goto(`${base}/${lang}/cv`, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.emulateMedia({ media: "print" });
  const path = `public/cv/younes-ouali-cv-${lang}.pdf`;
  const pdf = await page.pdf({ path, preferCSSPageSize: true, printBackground: true });
  const pages = (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  console.log(`${path}: ${pages} page(s), ${Math.round(pdf.length / 1024)} KB`);
}
await browser.close();
