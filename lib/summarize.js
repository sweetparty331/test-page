const SUMMARY_SYSTEM_PROMPT = "你是 AI 资讯速记员。只输出 JSON 对象，格式为 {\"items\":[{\"index\":0,\"title\":\"中文标题\",\"summary\":\"中文摘要\",\"summaryEn\":\"English summary\",\"whyItMatters\":\"\"}]}，不要 Markdown。title 必须忠于原文事实，用中文短标题。summary 用最短中文复述原文具体内容，30-60 个中文字，只写发生了什么，不写意义、不补充背景、不使用“值得关注/可用于判断/可能影响”等推断句。summaryEn 用 18-35 个英文词复述同一事实。whyItMatters 默认输出空字符串；只有原文明确说明影响时才用不超过 18 个中文字写出。";
const AI_BATCH_SIZE = 8;
const AI_CONTENT_MAX_LENGTH = 1200;

async function summarizeItems(items) {
  const deepSeekApiKey = getDeepSeekApiKey();

  if (deepSeekApiKey) {
    console.log("AI summary provider: DeepSeek");
    const deepSeekItems = await summarizeWithDeepSeek(items);
    if (deepSeekItems.length) {
      return deepSeekItems;
    }
  } else {
    console.warn("DeepSeek API key was not found; using local fallback summaries.");
  }

  if (process.env.OPENAI_API_KEY) {
    const aiItems = await summarizeWithOpenAI(items);
    if (aiItems.length) {
      return aiItems;
    }
  }

  return summarizeLocally(items);
}

function summarizeLocally(items) {
  return items.map((item) => {
    const baseText = item.content || item.title || "";
    return {
      sourceType: item.sourceType,
      author: item.author,
      group: item.group,
      publishedAt: item.publishedAt,
      category: item.category,
      title: toChineseTitle(item.title, item.category),
      originalTitle: item.title,
      summary: summarizeChinese(baseText || item.title),
      summaryEn: summarizeEnglish(baseText || item.title),
      whyItMatters: whyItMatters(item),
      url: item.url,
      dedupeKey: item.dedupeKey,
      people: item.people || [],
      peopleGroups: item.peopleGroups || []
    };
  });
}

async function summarizeWithDeepSeek(items) {
  const summaries = [];

  for (const batch of chunk(items, AI_BATCH_SIZE)) {
    const batchSummaries = await summarizeDeepSeekBatch(batch);
    summaries.push(...batchSummaries);
  }

  if (!summaries.length) {
    return [];
  }

  return applyAiSummaries(items, summaries);
}

async function summarizeDeepSeekBatch(batch) {
  try {
    const deepSeekApiKey = getDeepSeekApiKey();
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${deepSeekApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.DEEPSEEK_MODEL || "deepseek-v4-flash",
        messages: [
          {
            role: "system",
            content: SUMMARY_SYSTEM_PROMPT
          },
          {
            role: "user",
            content: JSON.stringify(batch.map((item) => ({
              index: item.aiIndex,
              title: item.title,
              category: item.category,
              content: shortenForAi(item.content || item.title)
            })))
          }
        ],
        response_format: { type: "json_object" }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn(`DeepSeek summary failed: HTTP ${response.status} ${shorten(errorText, 260)}`);
      return [];
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || "";
    return parseAiSummaries(text);
  } catch (error) {
    console.warn(`DeepSeek summary failed: ${error.message}`);
    return [];
  }
}

async function summarizeWithOpenAI(items) {
  const summaries = [];

  for (const batch of chunk(items, AI_BATCH_SIZE)) {
    const batchSummaries = await summarizeOpenAiBatch(batch);
    summaries.push(...batchSummaries);
  }

  if (!summaries.length) {
    return [];
  }

  return applyAiSummaries(items, summaries);
}

async function summarizeOpenAiBatch(batch) {
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
        store: false,
        input: [
          {
            role: "system",
            content: SUMMARY_SYSTEM_PROMPT
          },
          {
            role: "user",
            content: JSON.stringify(batch.map((item) => ({
              index: item.aiIndex,
              title: item.title,
              category: item.category,
              content: shortenForAi(item.content || item.title)
            })))
          }
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn(`OpenAI summary failed: HTTP ${response.status} ${shorten(errorText, 260)}`);
      return [];
    }

    const data = await response.json();
    const text = getResponseText(data);
    return parseAiSummaries(text);
  } catch (error) {
    console.warn(`OpenAI summary failed: ${error.message}`);
    return [];
  }
}

function applyAiSummaries(items, text) {
  const summaries = Array.isArray(text) ? text : parseAiSummaries(text);

  if (!Array.isArray(summaries)) {
    return [];
  }

  return summarizeLocally(items).map((item, index) => {
    const ai = summaries.find((summary) => Number(summary.index) === index) || {};
    return {
      ...item,
      title: toChineseTitle(ai.title || item.title, item.category),
      originalTitle: item.originalTitle || item.title,
      summary: shorten(ai.summary || item.summary, 70),
      summaryEn: shorten(ai.summaryEn || item.summaryEn, 180),
      whyItMatters: shorten(ai.whyItMatters || item.whyItMatters, 18)
    };
  });
}

function parseAiSummaries(text = "") {
  const rawText = String(text).trim();
  const candidates = [
    rawText,
    rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, ""),
    rawText.slice(rawText.indexOf("{"), rawText.lastIndexOf("}") + 1)
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      const summaries = Array.isArray(parsed) ? parsed : parsed.items;
      return Array.isArray(summaries) ? summaries : [];
    } catch (error) {
      // Try the next candidate.
    }
  }

  console.warn(`AI summary parse failed: ${shorten(rawText, 180)}`);
  return [];
}

function getResponseText(data) {
  if (data.output_text) {
    return data.output_text;
  }

  return (data.output || [])
    .flatMap((item) => item.content || [])
    .map((content) => content.text || "")
    .join("")
    .trim();
}

function summarize(text = "") {
  const cleaned = text
    .replace(/\s+/g, " ")
    .replace(/^[\s:：,-]+/, "")
    .trim();

  if (!cleaned) {
    return "这条动态暂时缺少可提炼的正文内容。";
  }

  const sentence = cleaned.split(/(?<=[。！？.!?])\s+/)[0] || cleaned;
  return shorten(sentence, 60);
}

function summarizeChinese(text = "") {
  const localSummary = summarize(text);
  if (!/[\u4e00-\u9fa5]/.test(localSummary)) {
    return `原文：${shorten(localSummary, 84)}`;
  }
  return shorten(localSummary, 70);
}

function summarizeEnglish(text = "") {
  const cleaned = String(text)
    .replace(/\s+/g, " ")
    .replace(/^[\s:：,-]+/, "")
    .trim();

  if (!cleaned) {
    return "No English summary is available for this item yet.";
  }

  return shorten(cleaned.split(/(?<=[.!?])\s+/)[0] || cleaned, 220);
}

function whyItMatters(item) {
  return "";
}

function toChineseTitle(title = "", category = "观点") {
  const normalized = String(title).replace(/\s+/g, " ").trim();
  if (/[\u4e00-\u9fa5]/.test(normalized)) {
    return shorten(normalized, 54);
  }
  return shorten(normalized || "AI 动态", 72);
}

function shorten(text = "", maxLength) {
  const normalized = String(text).replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1)}…`;
}

function shortenForAi(text = "") {
  return shorten(
    String(text)
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
    AI_CONTENT_MAX_LENGTH
  );
}

function chunk(items, size) {
  const indexedItems = items.map((item, index) => ({ ...item, aiIndex: index }));
  const chunks = [];

  for (let index = 0; index < indexedItems.length; index += size) {
    chunks.push(indexedItems.slice(index, index + size));
  }

  return chunks;
}

function getDeepSeekApiKey() {
  return process.env.DEEPSEEK_API_KEY || process.env.EEPSEEK_API_KEY || "";
}

module.exports = {
  summarizeItems,
  summarize
};
