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
  const timeoutMs = Number(source.timeoutMs) || (source.parser ? 18000 : 15000);
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(source.url, {
      signal: controller.signal,
      headers: {
        "User-Agent": source.parser ? "Mozilla/5.0 AI Daily Pulse" : "AI Daily Pulse RSS Reader"
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch ${source.name}: ${response.status}`);
    }

    const body = await response.text();
    const items = source.parser ? parsePage(body, source) : parseFeed(body, source);
    return items.slice(0, Number(source.limit) || 12);
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

function parsePage(html, source) {
  if (source.parser === "anthropic") {
    return parseAnthropicNews(html, source);
  }

  if (source.parser === "deeplearningBatch") {
    return parseDeepLearningBatch(html, source);
  }

  if (source.parser === "linkList") {
    return parseLinkList(html, source);
  }

  if (source.parser === "alibabaPress") {
    return parseAlibabaPress(html, source);
  }

  return [];
}

function parseAnthropicNews(html, source) {
  return extractLinks(html)
    .filter((link) => /^\/(news|research)\//.test(link.href) || link.href === "/glasswing" || link.href === "/81k-interviews")
    .map((link) => {
      const text = decodeXml(link.text);
      const date = extractEnglishDate(text);
      const title = cleanupAnthropicTitle(text);

      return {
        sourceType: source.type || "Blog",
        author: source.name,
        group: source.group || "未分组",
        publishedAt: normalizeDate(date),
        title,
        content: text,
        url: toAbsoluteUrl(link.href, source.url)
      };
    })
    .filter((item) => item.title && item.title.length >= 8);
}

function parseDeepLearningBatch(html, source) {
  const blocks = html.match(/<article\b[\s\S]*?<\/article>/gi) || [];

  return blocks.map((block) => {
    const href = readHref(block);
    if (!href || !/^\/the-batch\/(?!tag|about|page)/.test(href)) {
      return null;
    }

    const title = decodeXml(stripHtml(readTag(block, "h2")));
    const description = decodeXml(stripHtml(readClassText(block, "line-clamp-3")));
    const datetime = readDateTime(block);

    return {
      sourceType: source.type || "Blog",
      author: source.name,
      group: source.group || "未分组",
      publishedAt: normalizeDate(datetime),
      title,
      content: description || title,
      url: toAbsoluteUrl(href, source.url)
    };
  }).filter((item) => item && item.title);
}

function parseLinkList(html, source) {
  const patterns = Array.isArray(source.includePatterns) ? source.includePatterns : [];
  const links = [
    ...extractLinks(html),
    ...extractRawLinks(html).map((href) => ({ href, text: titleFromUrl(href) }))
  ];
  const seen = new Set();

  return links
    .filter((link) => link.href && matchesAnyPattern(link.href, patterns))
    .filter((link) => {
      const key = toAbsoluteUrl(link.href, source.url);
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .map((link) => {
      const text = decodeXml(link.text || titleFromUrl(link.href));
      const date = extractEnglishDate(text) || extractIsoDate(text);
      const title = cleanupLinkTitle(text);

      return {
        sourceType: source.type || "Blog",
        author: source.name,
        group: source.group || "未分组",
        publishedAt: normalizeDate(date),
        title,
        content: text,
        url: toAbsoluteUrl(link.href, source.url)
      };
    })
    .filter((item) => item.title && item.title.length >= 8 && !isGenericLinkTitle(item.title));
}

function parseAlibabaPress(html, source) {
  return [...html.matchAll(/\{[^{}]*"readMoreLink":"[^"]+"[^{}]*\}/g)]
    .map((match) => {
      const block = match[0];
      const title = decodeJsString(readJsonLikeField(block, "heading"));
      const description = decodeJsString(readJsonLikeField(block, "description"));
      const url = decodeJsString(readJsonLikeField(block, "readMoreLink"));
      const year = decodeJsString(readJsonLikeField(block, "year"));
      const date = decodeJsString(readJsonLikeField(block, "date"));

      return {
        sourceType: source.type || "News",
        author: source.name,
        group: source.group || "未分组",
        publishedAt: normalizeDate(`${date} ${year}`.trim()),
        title,
        content: description || title,
        url: toAbsoluteUrl(url, source.url)
      };
    })
    .filter((item) => item.title && item.url);
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

function readHref(block) {
  const match = block.match(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/i);
  return match ? match[1] : "";
}

function readDateTime(block) {
  const match = block.match(/<time\b[^>]*dateTime=["']([^"']+)["'][^>]*>/i) ||
    block.match(/<time\b[^>]*datetime=["']([^"']+)["'][^>]*>/i);
  return match ? match[1] : "";
}

function readClassText(block, className) {
  const pattern = new RegExp(`<[^>]+class=["'][^"']*${className}[^"']*["'][^>]*>([\\s\\S]*?)<\\/[^>]+>`, "i");
  const match = block.match(pattern);
  return match ? match[1] : "";
}

function readJsonLikeField(block, field) {
  const pattern = new RegExp(`"${field}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, "i");
  const match = block.match(pattern);
  return match ? match[1] : "";
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

function extractLinks(html = "") {
  return [...html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .map((match) => ({
      href: decodeXml(match[1]),
      text: stripHtml(match[2])
    }));
}

function extractRawLinks(html = "") {
  const normalizedHtml = String(html)
    .replace(/\\u002F/g, "/")
    .replace(/\\\//g, "/");

  return [...normalizedHtml.matchAll(/(?:href=|["'])(https?:\/\/[^"']+|\/[a-z0-9][^"']+)["']/gi)]
    .map((match) => decodeXml(match[1]));
}

function extractEnglishDate(text = "") {
  const match = String(text).match(/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},\s+\d{4}\b/i);
  return match ? match[0] : "";
}

function cleanupAnthropicTitle(text = "") {
  return String(text)
    .replace(/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},\s+\d{4}\b/i, " ")
    .replace(/\b(Product|Policy|Announcements|Research|Company|News)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanupLinkTitle(text = "") {
  return String(text)
    .replace(/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},\s+\d{4}\b/i, " ")
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, " ")
    .replace(/\b(Media Coverage|News|Press Release|Blog)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractIsoDate(text = "") {
  const match = String(text).match(/\b\d{4}-\d{2}-\d{2}\b/);
  return match ? match[0] : "";
}

function matchesAnyPattern(value = "", patterns = []) {
  if (!patterns.length) {
    return true;
  }

  return patterns.some((pattern) => String(value).includes(pattern));
}

function titleFromUrl(url = "") {
  const pathname = String(url).split("?")[0].replace(/\/$/, "");
  const slug = pathname.split("/").pop() || "AI news";
  return slug
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .trim();
}

function isGenericLinkTitle(title = "") {
  return /^(read more|see all|learn more|view more)$/i.test(String(title).trim());
}

function toAbsoluteUrl(url = "", baseUrl = "") {
  try {
    return new URL(url, baseUrl).toString();
  } catch (error) {
    return url;
  }
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

function decodeJsString(value = "") {
  return String(value)
    .replace(/\\"/g, '"')
    .replace(/\\n/g, " ")
    .replace(/\\u002F/g, "/")
    .replace(/\\\//g, "/")
    .replace(/\s+/g, " ")
    .trim();
}

module.exports = {
  buildRssHubSources,
  buildXStatusSources,
  fetchXStatusSources,
  loadConfig,
  fetchSources,
  parseFeed
};
