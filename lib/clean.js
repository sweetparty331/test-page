const BLOCK_WORDS = [
  "抽奖",
  "转发",
  " giveaway",
  "招聘",
  "课程",
  "优惠码",
  "sponsor",
  "newsletter subscription",
  "subscribe now"
];

const CATEGORY_RULES = [
  { category: "论文", words: ["paper", "arxiv", "论文", "research", "benchmark", "评测"] },
  { category: "产品", words: ["launch", "release", "发布", "更新", "product", "api", "app"] },
  { category: "技术", words: ["model", "模型", "agent", "inference", "推理", "训练", "开源", "open source"] },
  { category: "行业", words: ["funding", "融资", "acquire", "收购", "policy", "regulation", "监管", "s-1", "series"] }
];

const SCORE_WORDS = [
  "模型",
  "model",
  "产品",
  "论文",
  "paper",
  "开源",
  "open source",
  "融资",
  "benchmark",
  "agent",
  "inference",
  "推理",
  "multimodal",
  "多模态",
  "api",
  "ai",
  "claude",
  "anthropic",
  "deepseek",
  "gemini",
  "qwen",
  "nvidia",
  "llm",
  "reasoning",
  "compute"
];

function cleanItems(items) {
  const scored = items
    .map((item) => ({ ...item, score: scoreItem(item), category: detectCategory(item) }))
    .filter((item) => !isBlocked(item))
    .filter((item) => item.score > 0)
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));

  return dedupe(scored).slice(0, 40);
}

function isBlocked(item) {
  const text = `${item.title || ""} ${item.content || ""}`.toLowerCase();
  const plainLinkOnly = text.replace(/https?:\/\/\S+/g, "").trim().length < 12;
  return plainLinkOnly || BLOCK_WORDS.some((word) => text.includes(word.toLowerCase()));
}

function scoreItem(item) {
  const text = `${item.title || ""} ${item.content || ""}`.toLowerCase();
  return SCORE_WORDS.reduce((score, word) => score + (text.includes(word.toLowerCase()) ? 1 : 0), 0);
}

function detectCategory(item) {
  const text = `${item.title || ""} ${item.content || ""}`.toLowerCase();
  const rule = CATEGORY_RULES.find((candidate) => {
    return candidate.words.some((word) => text.includes(word.toLowerCase()));
  });
  return rule ? rule.category : "观点";
}

function dedupe(items) {
  const seen = new Set();
  const result = [];

  items.forEach((item) => {
    const dedupeKey = createDedupeKey(item);
    if (seen.has(dedupeKey)) {
      return;
    }
    seen.add(dedupeKey);
    result.push({ ...item, dedupeKey });
  });

  return result;
}

function createDedupeKey(item) {
  const urlKey = normalizeUrl(item.url);
  if (urlKey) {
    return urlKey;
  }
  return normalizeText(item.title).slice(0, 80);
}

function normalizeUrl(url = "") {
  return url
    .replace(/[?#].*$/, "")
    .replace(/\/$/, "")
    .trim()
    .toLowerCase();
}

function normalizeText(text = "") {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .trim();
}

module.exports = {
  cleanItems,
  detectCategory,
  createDedupeKey
};
