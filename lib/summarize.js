async function summarizeItems(items) {
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
      title: shorten(item.title, 54),
      summary: summarize(baseText || item.title),
      whyItMatters: whyItMatters(item),
      url: item.url,
      dedupeKey: item.dedupeKey
    };
  });
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
            content: "你是 AI 资讯编辑。只输出 JSON 数组，不要 Markdown。每条 summary 最多 60 个中文字，whyItMatters 最多 34 个中文字。剔除广告感、情绪化和闲聊。"
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
    const summaries = JSON.parse(text);

    if (!Array.isArray(summaries)) {
      return [];
    }

    return summarizeLocally(items).map((item, index) => {
      const ai = summaries.find((summary) => summary.index === index) || {};
      return {
        ...item,
        summary: shorten(ai.summary || item.summary, 60),
        whyItMatters: shorten(ai.whyItMatters || item.whyItMatters, 34)
      };
    });
  } catch (error) {
    return [];
  }
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
