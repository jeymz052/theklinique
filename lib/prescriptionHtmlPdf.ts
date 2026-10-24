import { access, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { PDFDocument, PDFHexString, PDFName } from "pdf-lib";
import type { Browser } from "puppeteer-core";
import type { MedicalDocument } from "@/lib/consultation";
import { prescriptionAccent, prescriptionBodyMarkup, prescriptionClassName, prescriptionPageWidth } from "@/lib/prescriptionDocument";

let assetPromise: Promise<{ css: string; logo: string }> | undefined;
function assets() {
  return assetPromise ||= (async () => {
    const base = process.cwd();
    const [stylesheet, regular, italic, symbols, logo] = await Promise.all([
      readFile(path.join(base, "app/prescription-document.css"), "utf8"),
      readFile(path.join(base, "public/fonts/prescription/Arimo-Variable.ttf")),
      readFile(path.join(base, "public/fonts/prescription/Arimo-Italic.ttf")),
      readFile(path.join(base, "public/fonts/prescription/NotoSans-Regular.ttf")),
      readFile(path.join(base, "public/images/the_klinique_logo-removebg-preview.png")),
    ]);
    return {
      css: stylesheet.replaceAll("/fonts/prescription/Arimo-Variable.ttf", `data:font/ttf;base64,${regular.toString("base64")}`).replaceAll("/fonts/prescription/Arimo-Italic.ttf", `data:font/ttf;base64,${italic.toString("base64")}`).replaceAll("/fonts/prescription/NotoSans-Regular.ttf", `data:font/ttf;base64,${symbols.toString("base64")}`),
      logo: `data:image/png;base64,${logo.toString("base64")}`,
    };
  })().catch(error => { assetPromise = undefined; throw error; });
}

export async function prescriptionPdfHtml(document: MedicalDocument) {
  if (document.document_type !== "prescription") throw new Error("PDF export is available for prescriptions.");
  const { css, logo } = await assets();
  const body = prescriptionBodyMarkup({ content: document.content, reference: document.reference_no, issuedAt: document.issued_at, logoSrc: logo });
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><style>${css}</style><style>html,body{margin:0;padding:0;font-size:16px}body{width:${prescriptionPageWidth}px;background:#fff}.rx-paper{margin:0;overflow:visible}</style></head><body><article class="${prescriptionClassName(false)}" style="--rx-accent:${prescriptionAccent(document.content.appearance.accentColor)}">${body}</article></body></html>`;
}

async function browser(): Promise<Browser> {
  const { default: puppeteer } = await import("puppeteer-core");
  const serverless = process.platform === "linux" && (process.env.VERCEL || process.env.AWS_EXECUTION_ENV);
  if (!serverless) {
    const candidates = [process.env.PUPPETEER_EXECUTABLE_PATH, process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      process.platform === "win32" ? "C:/Program Files/Google/Chrome/Application/chrome.exe" : "",
      process.platform === "win32" ? "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" : "",
      process.platform === "darwin" ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" : "",
      process.platform === "linux" ? "/usr/bin/google-chrome" : "", process.platform === "linux" ? "/usr/bin/chromium" : "",
    ].filter((value): value is string => Boolean(value));
    for (const executablePath of candidates) {
      try { await access(executablePath); } catch { continue; }
      return puppeteer.launch({ executablePath, headless: true, args: ["--disable-dev-shm-usage"], timeout: 15_000 });
    }
    if (process.platform !== "linux") throw new Error("Install Chrome or set PUPPETEER_EXECUTABLE_PATH for local PDF rendering.");
  }
  const { default: chromium } = await import("@sparticuz/chromium");
  return puppeteer.launch({ executablePath: await chromium.executablePath(), args: chromium.args, headless: "shell", timeout: 15_000 });
}

const pending = new Map<string, Promise<Uint8Array>>();
let queue: Promise<unknown> = Promise.resolve();

export function createPrescriptionPdf(document: MedicalDocument): Promise<Uint8Array> {
  const digest = createHash("sha256").update(JSON.stringify({ layout: 2, document })).digest("hex");
  const cached = pending.get(digest);
  if (cached) return cached;
  const result = queue.then(async () => {
    const html = await prescriptionPdfHtml(document);
    const instance = await browser();
    try {
      const page = await instance.newPage();
      await page.setViewport({ width: 1440, height: 1200, deviceScaleFactor: 1 });
      await page.setJavaScriptEnabled(false);
      await page.setRequestInterception(true);
      page.on("request", request => { void (request.url().startsWith("data:") || request.url() === "about:blank" ? request.continue() : request.abort()); });
      await page.emulateMediaType("screen");
      await page.setContent(html, { waitUntil: "load", timeout: 15_000 });
      await page.evaluate(async () => {
        await globalThis.document.fonts.ready;
        await Promise.all(Array.from(globalThis.document.images, image => image.decode()));
      });
      const pageWidth = 210 / 25.4 * 96, pageHeight = 297 / 25.4 * 96;
      const widthScale = pageWidth / prescriptionPageWidth;
      const height = await page.$eval(".rx-paper", element => element.getBoundingClientRect().height + 2);
      // Fit short prescriptions uniformly to one A4 sheet; longer documents keep
      // the same readable width and paginate without dropping any content.
      const scale = height * widthScale <= pageHeight / .9 ? Math.min(widthScale, pageHeight / height) : widthScale;
      await page.addStyleTag({ content: `body{width:${pageWidth / scale}px}.rx-paper{margin:0 auto}` });
      const bytes = await page.pdf({ format: "A4", scale, printBackground: true, preferCSSPageSize: false, margin: { top: 0, right: 0, bottom: 0, left: 0 }, timeout: 20_000 });
      const pdf = await PDFDocument.load(bytes);
      pdf.setTitle(`${document.content.appearance.heading || "Prescription"} ${document.reference_no}`);
      pdf.setAuthor(document.content.prescriber.name); pdf.setCreator("The Klinique"); pdf.setProducer("The Klinique");
      pdf.setCreationDate(new Date(document.issued_at)); pdf.setModificationDate(new Date(document.issued_at));
      pdf.catalog.delete(PDFName.of("Metadata"));
      pdf.context.trailerInfo.ID = pdf.context.obj([PDFHexString.of(digest.slice(0, 32)), PDFHexString.of(digest.slice(0, 32))]);
      return await pdf.save({ useObjectStreams: false });
    } finally { await instance.close(); }
  });
  queue = result.catch(() => undefined);
  pending.set(digest, result);
  while (pending.size > 12) pending.delete(pending.keys().next().value!);
  void result.catch(() => pending.delete(digest));
  return result;
}
