const fs = require("fs");
const path = require("path");

const CONFIG_PATH = path.join(process.cwd(), "config.json");

function loadConfig() {
  const raw = fs.readFileSync(CONFIG_PATH, "utf8");
  const config = JSON.parse(raw);
  return {
    sources: Array.isArray(config.sources) ? config.sources : [],
    pendingSources: Array.isArray(config.pendingSources) ? config.pendingSources : []
  };
}

async function fetchSources(sources) {
  const batches = await Promise.allSettled(sources.map(fetchSource));
  return batches.flatMap((batch) => (batch.status === "fulfilled" ? batch.value : []));
}

async function fetchSource(source) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(source.url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "AI Daily Pulse RSS Reader"
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch ${source.name}: ${response.status}`);
    }

    const xml = await response.text();
    return parseFeed(xml, source).slice(0, 12);
  } finally {
    clearTimeout(timeout);
  }
}

function parseFeed(xml, source) {
  const itemBlocks = matchBlocks(xml, "item");
  const entryBlocks = itemBlocks.length ? [] : matchBlocks(xml, "entry");
  const blocks = itemBlocks.length ? itemBlocks : entryBlocks;

  return blocks.map((block) => {
    const title = decodeXml(readTag(block, "title"));
    const link = decodeXml(readLink(block));
    const description = decodeXml(readTag(block, "description") || readTag(block, "summary") || readTag(block, "content"));
    const publishedAt = readTag(block, "pubDate") || readTag(block, "published") || readTag(block, "updated");

    return {
      sourceType: source.type || "Blog",
      author: source.name,
      group: source.group || "未分组",
      publishedAt: normalizeDate(publishedAt),
      title: stripHtml(title),
      content: stripHtml(description),
      url: link || source.url
    };
  }).filter((item) => item.title || item.content);
}

function matchBlocks(xml, tagName) {
  const pattern = new RegExp(`<${tagName}\\b[\\s\\S]*?<\\/${tagName}>`, "gi");
  return xml.match(pattern) || [];
}

function readTag(block, tagName) {
  const pattern = new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i");
  const match = block.match(pattern);
  return match ? match[1].trim() : "";
}

function readLink(block) {
  const hrefMatch = block.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*>/i);
  if (hrefMatch) {
    return hrefMatch[1];
  }
  return readTag(block, "link");
}

function normalizeDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function stripHtml(value = "") {
  return value
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeXml(value = "") {
  return value
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'");
}

module.exports = {
  loadConfig,
  fetchSources,
  parseFeed
};
