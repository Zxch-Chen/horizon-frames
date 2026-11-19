#!/usr/bin/env node
// Record a horizon-frames intro to an MP4, frame by frame, so no cut is ever dropped.
//
//   npx -y -p playwright node scripts/record.mjs --url "http://localhost:8765/horizon.html?intro=1" --out intro.mp4
//
// Options: --seconds 14  --fps 60  --size 1920x1080  --hide ".skip,.top"  --chrome (use installed Google Chrome)
//
// How: Playwright's fake clock freezes time (setTimeout, requestAnimationFrame, performance.now).
// For each video frame we advance the clock by exactly 1/fps, pin every CSS animation and
// transition to the same virtual time, and take a screenshot. ffmpeg turns the PNGs into an
// H.264 MP4 (yuv420p, faststart), which X, Instagram, and most players accept.
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const arg = (k, d) => { const i = process.argv.indexOf("--" + k); return i > 0 ? process.argv[i + 1] : d; };
const flag = (k) => process.argv.includes("--" + k);
const url = arg("url", "http://localhost:8765/horizon.html?intro=1");
const out = arg("out", "intro.mp4");
const seconds = +arg("seconds", 14), fps = +arg("fps", 60);
const [W, H] = arg("size", "1920x1080").split("x").map(Number);
const hide = arg("hide", ".skip");

const dir = mkdtempSync(join(tmpdir(), "horizon-rec-"));
const browser = await chromium.launch({
  channel: flag("chrome") ? "chrome" : undefined,
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--hide-scrollbars"],
});
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
await page.clock.install({ time: 0 });
await page.clock.pauseAt(1000);
await page.goto(url, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
await page.addStyleTag({ content: `${hide} { display: none !important; } * { cursor: none !important; }` });

const n = Math.round(seconds * fps);
for (let i = 0; i < n; i++) {
  await page.clock.runFor(1000 / fps);
  // CSS animations run on real time; pin each one to virtual time since it first appeared.
  await page.evaluate(() => {
    const now = performance.now();
    window.__seen ??= new WeakMap();
    for (const a of document.getAnimations()) {
      if (!window.__seen.has(a)) window.__seen.set(a, now);
      a.pause();
      a.currentTime = now - window.__seen.get(a);
    }
  });
  await page.screenshot({ path: join(dir, `f${String(i).padStart(5, "0")}.png`) });
  if (i % fps === 0) process.stdout.write(`${i / fps}s `);
}
await browser.close();
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", String(fps), "-i", join(dir, "f%05d.png"),
  "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out], { stdio: "inherit" });
rmSync(dir, { recursive: true, force: true });
console.log("\n" + out);
