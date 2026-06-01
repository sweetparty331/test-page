const {
  buildRssHubSources,
  buildXStatusSources,
  fetchXStatusSources,
  loadConfig,
  fetchSources
} = require("./sources");
const { cleanItems } = require("./clean");
const { tagPeople } = require("./people");
const { summarizeItems } = require("./summarize");

async function buildFeed() {
  try {
    const config = loadConfig();
    const rssHubSources = buildRssHubSources(config.pendingSources);
    const xStatusSources = buildXStatusSources(config.pendingSources);
    const activeSources = [...config.sources, ...rssHubSources, ...xStatusSources];
    const [rssItems, xItems] = await Promise.all([
      fetchSources([...config.sources, ...rssHubSources]),
      fetchXStatusSources(xStatusSources)
    ]);
    const rawItems = [...rssItems, ...xItems];
    const cleanFeed = cleanItems(rawItems);
    const peopleTaggedFeed = tagPeople(cleanFeed, config.pendingSources);
    const items = await summarizeItems(peopleTaggedFeed);
    const finalItems = items.length ? items : fallbackItems();

    return {
      updatedAt: new Date().toISOString(),
      sources: activeSources,
      pendingSources: config.pendingSources,
      items: finalItems,
      warning: items.length ? undefined : "No feed items matched the current clean-feed rules."
    };
  } catch (error) {
    return {
      updatedAt: new Date().toISOString(),
      sources: [],
      pendingSources: [],
      items: fallbackItems(),
      warning: error.message
    };
  }
}

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

module.exports = {
  buildFeed,
  fallbackItems
};
