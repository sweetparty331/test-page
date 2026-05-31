const { loadConfig, fetchSources } = require("../lib/sources");
const { cleanItems } = require("../lib/clean");
const { tagPeople } = require("../lib/people");
const { summarizeItems } = require("../lib/summarize");

module.exports = async function handler(request, response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Cache-Control", "s-maxage=900, stale-while-revalidate=3600");

  if (request.method && request.method !== "GET") {
    response.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const config = loadConfig();
    const rawItems = await fetchSources(config.sources);
    const cleanFeed = cleanItems(rawItems);
    const peopleTaggedFeed = tagPeople(cleanFeed, config.pendingSources);
    const items = await summarizeItems(peopleTaggedFeed);
    const finalItems = items.length ? items : fallbackItems();

    response.status(200).json({
      updatedAt: new Date().toISOString(),
      sources: config.sources,
      pendingSources: config.pendingSources,
      items: finalItems,
      warning: items.length ? undefined : "No feed items matched the current clean-feed rules."
    });
  } catch (error) {
    response.status(200).json({
      updatedAt: new Date().toISOString(),
      sources: [],
      pendingSources: [],
      items: fallbackItems(),
      warning: error.message
    });
  }
};

function fallbackItems() {
  return [
    {
      sourceType: "Blog",
      author: "AI Daily Pulse",
      group: "系统",
      publishedAt: new Date().toISOString(),
      category: "行业",
      title: "暂时无法拉取远程 RSS",
      summary: "当前返回降级数据，页面结构和筛选功能仍可正常演示。",
      whyItMatters: "部署后可先检查 RSS 源是否可访问，再逐步接入更多来源。",
      url: "https://vercel.com/docs/functions",
      dedupeKey: "fallback-feed"
    }
  ];
}
