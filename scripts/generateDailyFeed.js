const fs = require("fs");
const path = require("path");
const { buildFeed } = require("../lib/feed");

const DATA_DIR = path.join(process.cwd(), "data");
const DAILY_DIR = path.join(DATA_DIR, "daily");

async function main() {
  const feed = await buildFeed();
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

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
