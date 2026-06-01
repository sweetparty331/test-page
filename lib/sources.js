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

function buildRssHubSources(pendingSources = []) {
  const baseUrl = String(process.env.RSSHUB_BASE_URL || "").replace(/\/$/, "");
  if (!baseUrl) {
    return [];
  }

  const seen = new Set();
  const sources = [];

  pendingSources.forEach((source) => {
    const candidates = [
      { label: "X", rssHubPath: source.rssHubPath },
      ...(Array.isArray(source.links) ? source.links : [])
    ].filter((link) => link.rssHubPath);

    candidates.forEach((link) => {
      const path = link.rssHubPath.startsWith("/") ? link.rssHubPath : `/${link.rssHubPath}`;
      if (seen.has(path)) {
        return;
      }

      seen.add(path);
      const sourceName = String(source.name || "RSSHub");
      const label = String(link.label || "");
      const suffix = label && !sourceName.toLowerCase().includes(label.toLowerCase()) ? ` · ${label}` : "";

      sources.push({
        name: `${sourceName}${suffix}`,
        group: source.group || "社媒",
        type: "X",
        url: `${baseUrl}${path}`
      });
    });
  });

  return sources;
}

function buildXStatusSources(pendingSources = []) {
  if (String(process.env.ENABLE_X_FEEDS || "true").toLowerCase() === "false") {
    return [];
  }

  const seen = new Set();
  const sources = [];

  pendingSources.forEach((source) => {
    const candidates = [
      { label: source.type === "X" ? "" : "X", url: source.url, rssHubPath: source.rssHubPath, xHandle: source.xHandle },
      ...(Array.isArray(source.links) ? source.links : [])
    ];

    candidates.forEach((link) => {
      const handle = extractXHandle(link);
      if (!handle || seen.has(handle.toLowerCase())) {
        return;
      }

      seen.add(handle.toLowerCase());
      sources.push({
        name: source.type === "X" ? source.name : `${source.name}${link.label ? ` · ${link.label}` : ""}`,
        group: source.group || "社媒",
        type: "X",
        handle,
        url: `https://x.com/${handle}`
      });
    });
  });

  return sources;
}

async function fetchSources(sources) {
  const batches = await Promise.allSettled(sources.map(fetchSource));
  return batches.flatMap((batch) => (batch.status === "fulfilled" ? batch.value : []));
}

async function fetchXStatusSources(sources) {
  const batches = await Promise.allSettled(sources.map(fetchXStatusSource));
  return batches.flatMap((batch) => (batch.status === "fulfilled" ? batch.value : []));
}

async function fetchSource(source) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), source.type === "X" ? 5000 : 8000);

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

async function fetchXStatusSource(source) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  const apiBase = String(process.env.X_STATUS_API_BASE || "https://api.fxtwitter.com").replace(/\/$/, "");
  const limit = Number(process.env.X_STATUS_LIMIT || 4);

  try {
    const response = await fetch(`${apiBase}/2/profile/${encodeURIComponent(source.handle)}/statuses`, {
      signal: controller.signal,
      headers: {
        "User-Agent": "AI Daily Pulse X Reader"
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch X source ${source.name}: ${response.status}`);
    }

    const payload = await response.json();
    return parseXStatuses(payload, source).slice(0, Number.isFinite(limit) ? limit : 4);
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

function parseXStatuses(payload, source) {
  const statuses = Array.isArray(payload.results) ? payload.results : [];

  return statuses
    .filter((status) => status && status.type === "status" && !status.reposted_by)
    .map((status) => {
      const text = stripHtml(status.text || status.raw_text?.text || "");
      const authorName = status.author?.name || source.name;

      return {
        sourceType: "X",
        author: authorName,
        group: source.group || "社媒",
        publishedAt: normalizeDate(status.created_at || status.created_timestamp * 1000),
        title: shortenText(text, 80),
        content: text,
        url: status.url || source.url,
        xHandle: status.author?.screen_name || source.handle,
        engagement: {
          replies: status.replies || 0,
          reposts: status.reposts || 0,
          likes: status.likes || 0,
          views: status.views || 0
        }
      };
    })
    .filter((item) => item.title || item.content);
}

function extractXHandle(link = {}) {
  if (link.xHandle) {
    return sanitizeHandle(link.xHandle);
  }

  const rssHubMatch = String(link.rssHubPath || "").match(/\/twitter\/user\/([^/?#]+)/i);
  if (rssHubMatch) {
    return sanitizeHandle(rssHubMatch[1]);
  }

  const urlMatch = String(link.url || "").match(/(?:x|twitter)\.com\/([^/?#]+)/i);
  return urlMatch ? sanitizeHandle(urlMatch[1]) : "";
}

function sanitizeHandle(value = "") {
  return String(value).replace(/^@/, "").trim();
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

function shortenText(value = "", maxLength = 80) {
  const normalized = String(value).replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1)}…`;
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
  buildRssHubSources,
  buildXStatusSources,
  fetchXStatusSources,
  loadConfig,
  fetchSources,
  parseFeed
};
