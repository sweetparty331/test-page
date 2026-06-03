const fs = require("fs");
const path = require("path");
const { buildFeed } = require("../lib/feed");

const DATA_DIR = path.join(process.cwd(), "data");
const DAILY_DIR = path.join(DATA_DIR, "daily");

async function main() {
  if (requiresChineseSummaries() && !hasAiSummaryKey()) {
    throw new Error("DEEPSEEK_API_KEY was not found. Add it in GitHub Settings > Secrets and variables > Actions > Repository secrets.");
  }

  const feed = await buildFeed();
  assertChineseSummaryQuality(feed);
  const date = getDateKey(feed.updatedAt);
  const dailyPath = path.join(DAILY_DIR, `${date}.json`);
  const latestPath = path.join(DATA_DIR, "latest.json");

  fs.mkdirSync(DAILY_DIR, { recursive: true });
  fs.writeFileSync(dailyPath, `${JSON.stringify(feed, null, 2)}\n`);
  fs.writeFileSync(latestPath, `${JSON.stringify(feed, null, 2)}\n`);

  console.log(`Generated ${path.relative(process.cwd(), latestPath)}`);
  console.log(`Generated ${path.relative(process.cwd(), dailyPath)}`);
  console.log(`Items: ${feed.items.length}`);
  console.log(`Sources: ${feed.sources.length}`);
  if (feed.warning) {
    console.log(`Warning: ${feed.warning}`);
  }
}

function getDateKey(value) {
  const date = new Date(value);
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  return safeDate.toISOString().slice(0, 10);
}

function assertChineseSummaryQuality(feed) {
  if (!requiresChineseSummaries()) {
    return;
  }

  const items = Array.isArray(feed.items) ? feed.items : [];
  if (!items.length) {
    throw new Error("Feed snapshot has no items.");
  }

  const rawFallbackCount = items.filter((item) => /^原文：/.test(item.summary || "")).length;
  const chineseTitleCount = items.filter((item) => /[\u4e00-\u9fa5]/.test(item.title || "")).length;
  const rawFallbackRatio = rawFallbackCount / items.length;

  if (rawFallbackRatio > 0.25 || chineseTitleCount < Math.ceil(items.length * 0.5)) {
    throw new Error(`Chinese summary quality check failed: ${rawFallbackCount}/${items.length} fallback summaries, ${chineseTitleCount}/${items.length} Chinese titles.`);
  }
}

function requiresChineseSummaries() {
  return String(process.env.REQUIRE_CHINESE_SUMMARIES || "").toLowerCase() === "true";
}

function hasAiSummaryKey() {
  return Boolean(process.env.DEEPSEEK_API_KEY || process.env.EEPSEEK_API_KEY || process.env.OPENAI_API_KEY);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
