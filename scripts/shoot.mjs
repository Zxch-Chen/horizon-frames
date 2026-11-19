#!/usr/bin/env node
// Screenshot frames of a horizon-frames intro, check the shader compiled, and tile a contact sheet.
//
//   npx -y -p playwright node scripts/shoot.mjs --chrome --url http://localhost:8765/horizon.html --out /tmp/frames
//
// Options:
//   --frames 0,5,end   which frames (default: every frame, then the end card). Indices are 0-based
//                      positions in FRAMES, so they shift when you insert frames.
//   --size 1456x829    viewport. Phone widths (e.g. 375x812) are emulated properly, with touch and DPR 2.
//   --chrome           use the installed Google Chrome (real GPU, no banding). Without it, run
//                      `npx playwright install chromium` once.
//
// Writes <out>/frame-N.png and a contact sheet: <out>/sheet.png for a full run, or
// <out>/sheet-<frames>.png for a subset, so a quick re-shoot never overwrites the full sheet.
// Exits with code 1, printing the GLSL error log, if the shader fails to compile.
import { chromium } from "playwright";
import { mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const arg = (k, d) => { const i = process.argv.indexOf("--" + k); return i > 0 ? process.argv[i + 1] : d; };
const url = arg("url", "http://localhost:8765/horizon.html");
const out = resolve(arg("out", join(tmpdir(), "horizon-frames")));
const [W, H] = arg("size", "1456x829").split("x").map(Number);
const phone = W < 600;
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  channel: process.argv.includes("--chrome") ? "chrome" : undefined,
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--hide-scrollbars"],
});
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: phone ? 2 : 1, isMobile: phone, hasTouch: phone });
const page = await ctx.newPage();
const problems = [];
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") problems.push(m.text()); });
page.on("pageerror", (e) => problems.push("Page error: " + e.message));

const open = async (id) => {
  const u = new URL(url); u.searchParams.set("frame", id);
  await page.goto(u.href, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1800);                       // let the caption's focus-in finish
  return page.evaluate(() => ({ gl: document.body.dataset.gl, log: document.body.dataset.glLog, frames: +document.body.dataset.frames }));
};

const first = await open("0");
if (first.gl !== "ok") {
  console.error(first.gl === "failed" ? "Shader failed to compile:\n" + (first.log || problems.join("\n")) : "WebGL did not start (no data-gl=\"ok\" on <body>).");
  await browser.close(); process.exit(1);
}
const all = !arg("frames");
const ids = all ? [...Array(first.frames).keys()].map(String).concat("end") : arg("frames").split(",");
const shots = [];
for (const id of ids) {
  problems.length = 0;
  await open(id);
  const path = join(out, `frame-${id}.png`);
  await page.screenshot({ path });
  shots.push({ id, path });
  console.log(path + (problems.length ? "\n  ! " + problems.join("\n  ! ") : ""));
}

// Contact sheet: lay the shots out in a page and screenshot it. No image libraries needed.
const cols = Math.min(4, shots.length), tw = 480, th = Math.round(tw * H / W);
const cells = shots.map((s) => `<figure><img src="data:image/png;base64,${readFileSync(s.path).toString("base64")}"><figcaption>${s.id}</figcaption></figure>`).join("");
const sheet = await browser.newPage({ viewport: { width: cols * tw, height: 100 }, deviceScaleFactor: 1 });
await sheet.setContent(`<style>body{margin:0;background:#000;display:grid;grid-template-columns:repeat(${cols},${tw}px)}
  figure{margin:0;position:relative;width:${tw}px;height:${th}px}img{width:100%;height:100%;object-fit:cover;display:block}
  figcaption{position:absolute;left:8px;top:6px;color:#fff;font:12px system-ui;text-shadow:0 0 3px #000}</style>${cells}`);
const sheetPath = join(out, all ? "sheet.png" : `sheet-${ids.join("_")}.png`);
await sheet.screenshot({ path: sheetPath, fullPage: true });
console.log(sheetPath);
await browser.close();
