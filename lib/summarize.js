async function summarizeItems(items) {
  if (process.env.DEEPSEEK_API_KEY) {
    const deepSeekItems = await summarizeWithDeepSeek(items);
    if (deepSeekItems.length) {
      return deepSeekItems;
    }
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
      dedupeKey: item.dedupeKey
    };
  });
}

async function summarizeWithDeepSeek(items) {
  try {
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.DEEPSEEK_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.DEEPSEEK_MODEL || "deepseek-v4-flash",
        messages: [
          {
            role: "system",
            content: "你是 AI 资讯编辑。只输出 JSON 对象，格式为 {\"items\":[{\"index\":0,\"title\":\"中文标题\",\"summary\":\"中文摘要\",\"summaryEn\":\"English summary\",\"whyItMatters\":\"为什么重要\"}]}，不要 Markdown。title 必须是中文标题。summary 用中文，约 90-120 个中文字，先讲事实再讲意义。summaryEn 用英文，约 35-55 words。whyItMatters 最多 34 个中文字。剔除广告感、情绪化和闲聊。"
          },
          {
            role: "user",
            content: JSON.stringify(items.map((item, index) => ({
              index,
              title: item.title,
              category: item.category,
              content: item.content
            })))
          }
        ],
        response_format: { type: "json_object" }
      })
    });

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || "";
    return applyAiSummaries(items, text);
  } catch (error) {
    return [];
  }
}

async function summarizeWithOpenAI(items) {
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
            content: "你是 AI 资讯编辑。只输出 JSON 对象，格式为 {\"items\":[{\"index\":0,\"title\":\"中文标题\",\"summary\":\"中文摘要\",\"summaryEn\":\"English summary\",\"whyItMatters\":\"为什么重要\"}]}，不要 Markdown。title 必须是中文标题。summary 用中文，约 90-120 个中文字，先讲事实再讲意义。summaryEn 用英文，约 35-55 words。whyItMatters 最多 34 个中文字。剔除广告感、情绪化和闲聊。"
          },
          {
            role: "user",
            content: JSON.stringify(items.map((item, index) => ({
              index,
              title: item.title,
              category: item.category,
              content: item.content
            })))
          }
        ]
      })
    });

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    const text = getResponseText(data);
    return applyAiSummaries(items, text);
  } catch (error) {
    return [];
  }
}

function applyAiSummaries(items, text) {
  const parsed = JSON.parse(text);
  const summaries = Array.isArray(parsed) ? parsed : parsed.items;

  if (!Array.isArray(summaries)) {
    return [];
  }

  return summarizeLocally(items).map((item, index) => {
    const ai = summaries.find((summary) => summary.index === index) || {};
    return {
      ...item,
      title: toChineseTitle(ai.title || item.title, item.category),
      originalTitle: item.originalTitle || item.title,
      summary: shorten(ai.summary || item.summary, 130),
      summaryEn: shorten(ai.summaryEn || item.summaryEn, 260),
      whyItMatters: shorten(ai.whyItMatters || item.whyItMatters, 34)
    };
  });
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
    const topic = topicFromText(localSummary);
    return `要点：这条资讯主要关注${topic}，可先用于判断相关公司在产品能力、工程落地或研究方向上的最新变化；配置 DeepSeek API 后会生成更贴近原文的中文摘要。`;
  }
  return `要点：${shorten(localSummary, 112)}。`;
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
  const category = item.category || "观点";
  const map = {
    观点: "可作为判断 AI 方向变化的高信号观点。",
    产品: "可能影响近期 AI 产品体验、接口能力或落地节奏。",
    技术: "值得关注其对模型效果、成本或工程复杂度的影响。",
    论文: "适合判断新方法是否具备可复现和可迁移价值。",
    行业: "有助于理解 AI 公司、资本和监管环境的变化。"
  };
  return map[category] || map["观点"];
}

function toChineseTitle(title = "", category = "观点") {
  const normalized = String(title).replace(/\s+/g, " ").trim();
  if (/[\u4e00-\u9fa5]/.test(normalized)) {
    return shorten(normalized, 54);
  }

  const lower = normalized.toLowerCase();
  if (lower.includes("codex")) {
    return "Codex 产品与工程实践更新";
  }
  if (lower.includes("agent")) {
    return "Agent 能力与应用更新";
  }
  if (lower.includes("benchmark") || lower.includes("evaluation") || lower.includes("eval")) {
    return "AI 评测方法更新";
  }
  if (lower.includes("inference") || lower.includes("latency")) {
    return "推理效率与部署更新";
  }
  if (lower.includes("safety") || lower.includes("trust")) {
    return "AI 安全与可信评测更新";
  }
  if (lower.includes("model") || lower.includes("multimodal")) {
    return "模型能力与多模态更新";
  }

  const fallbackByCategory = {
    观点: "AI 观点动态更新",
    产品: "AI 产品动态更新",
    技术: "AI 技术动态更新",
    论文: "AI 论文与研究更新",
    行业: "AI 行业动态更新"
  };
  return fallbackByCategory[category] || "AI 动态更新";
}

function topicFromText(text = "") {
  const lower = String(text).toLowerCase();
  if (lower.includes("codex")) {
    return "Codex 与开发者工具";
  }
  if (lower.includes("agent")) {
    return "Agent 能力和应用场景";
  }
  if (lower.includes("benchmark") || lower.includes("evaluation") || lower.includes("eval")) {
    return "AI 评测方法";
  }
  if (lower.includes("inference") || lower.includes("latency")) {
    return "推理效率和部署成本";
  }
  if (lower.includes("safety") || lower.includes("trust")) {
    return "AI 安全和可信评测";
  }
  if (lower.includes("model") || lower.includes("multimodal")) {
    return "模型能力和多模态体验";
  }
  return "AI 产品、技术或行业动态";
}

function shorten(text = "", maxLength) {
  const normalized = String(text).replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1)}…`;
}

module.exports = {
  summarizeItems,
  summarize
};
