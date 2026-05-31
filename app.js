const state = {
  items: [],
  sources: [],
  pendingSources: [],
  filters: {
    group: "全部",
    category: "全部",
    date: "today"
  }
};

const demoFeed = {
  updatedAt: new Date().toISOString(),
  sources: [
    { name: "OpenAI Blog", group: "大模型公司", type: "Blog", url: "https://openai.com/news/rss.xml" },
    { name: "Google AI Blog", group: "大模型公司", type: "Blog", url: "https://blog.google/technology/ai/rss/" },
    { name: "Google DeepMind Blog", group: "大模型公司", type: "Blog", url: "https://deepmind.google/blog/rss.xml" },
    { name: "NVIDIA AI Blog", group: "大模型公司", type: "Blog", url: "https://blogs.nvidia.com/blog/tag/artificial-intelligence/feed/" }
  ],
  pendingSources: [
    { name: "Anthropic News", group: "大模型公司", type: "Blog", url: "https://www.anthropic.com/news", reason: "官方 RSS 未确认，先保留官方页面链接。" },
    { name: "Meta AI Blog", group: "大模型公司", type: "Blog", url: "https://ai.meta.com/blog/", reason: "官方 RSS 未确认，先保留官方页面链接。" },
    { name: "The Gradient", group: "技术博客", type: "Blog", url: "https://thegradient.pub/rss/", reason: "技术博客名单保留，暂不真实接入。" },
    { name: "Yannic Kilcher", group: "技术博客", type: "YouTube", url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCZHmQk67mSJgfCCTn7xBfew", reason: "YouTube 名单保留，暂不真实接入。" }
  ],
  items: [
    {
      sourceType: "Blog",
      author: "OpenAI Blog",
      group: "大模型公司",
      publishedAt: new Date().toISOString(),
      category: "产品",
      title: "新模型能力更新",
      summary: "新模型更新重点放在更稳定的推理、工具调用和多模态体验上。",
      whyItMatters: "产品团队可以优先关注真实工作流里的延迟、成本和可靠性变化。",
      url: "https://openai.com/news/",
      dedupeKey: "demo-openai-model-update"
    },
    {
      sourceType: "Blog",
      author: "Google AI Blog",
      group: "大模型公司",
      publishedAt: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(),
      category: "技术",
      title: "AI 推理效率优化",
      summary: "推理效率优化正在从单纯压缩模型转向系统级调度和缓存策略。",
      whyItMatters: "这会直接影响企业部署 AI 应用时的成本上限。",
      url: "https://blog.google/technology/ai/",
      dedupeKey: "demo-google-inference"
    },
    {
      sourceType: "YouTube",
      author: "Yannic Kilcher",
      group: "技术博客",
      publishedAt: new Date(Date.now() - 1000 * 60 * 60 * 8).toISOString(),
      category: "论文",
      title: "新论文解读：Agent 评测",
      summary: "Agent 评测的关键争议从任务数量转向环境真实性和可复现性。",
      whyItMatters: "选择 Agent 框架时不能只看榜单分数，要看任务是否贴近业务。",
      url: "https://www.youtube.com/",
      dedupeKey: "demo-agent-paper"
    }
  ]
};

const elements = {
  cardList: document.querySelector("#cardList"),
  stateMessage: document.querySelector("#stateMessage"),
  resultCount: document.querySelector("#resultCount"),
  updatedAt: document.querySelector("#updatedAt"),
  refreshButton: document.querySelector("#refreshButton"),
  settingsButton: document.querySelector("#settingsButton"),
  settingsDialog: document.querySelector("#settingsDialog"),
  groupFilters: document.querySelector("#groupFilters"),
  categoryFilters: document.querySelector("#categoryFilters"),
  sourceList: document.querySelector("#sourceList")
};

elements.refreshButton.addEventListener("click", () => loadFeed(true));
elements.settingsButton.addEventListener("click", () => elements.settingsDialog.showModal());

document.querySelectorAll("[data-date]").forEach((button) => {
  button.addEventListener("click", () => {
    state.filters.date = button.dataset.date;
    setActive(document.querySelectorAll("[data-date]"), button);
    renderCards();
  });
});

loadFeed();

async function loadFeed(forceRefresh = false) {
  setStateMessage("正在拉取干净资讯...");
  elements.refreshButton.disabled = true;

  try {
    const response = await fetch(`/api/feed${forceRefresh ? "?refresh=1" : ""}`);
    if (!response.ok) {
      throw new Error(`Feed request failed: ${response.status}`);
    }
    const data = await response.json();
    applyFeed(data);
  } catch (error) {
    applyFeed(demoFeed);
    setStateMessage("暂时无法连接后端接口，已展示本地演示数据。部署到 Vercel 后会调用 /api/feed。");
  } finally {
    elements.refreshButton.disabled = false;
  }
}

function applyFeed(data) {
  state.items = Array.isArray(data.items) ? data.items : [];
  state.sources = Array.isArray(data.sources) ? data.sources : [];
  state.pendingSources = Array.isArray(data.pendingSources) ? data.pendingSources : [];
  elements.updatedAt.textContent = `更新于 ${formatDateTime(data.updatedAt || new Date().toISOString())}`;
  renderFilters();
  renderSources();
  renderCards();
}

function renderFilters() {
  const groups = ["全部", ...unique(state.sources.map((source) => source.group).filter(Boolean))];
  const categories = ["全部", "观点", "产品", "技术", "论文", "行业"];

  renderFilterButtons(elements.groupFilters, groups, "group");
  renderFilterButtons(elements.categoryFilters, categories, "category");
}

function renderFilterButtons(container, values, key) {
  container.innerHTML = "";
  values.forEach((value) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `filter-chip${state.filters[key] === value ? " active" : ""}`;
    button.textContent = value;
    button.addEventListener("click", () => {
      state.filters[key] = value;
      renderFilterButtons(container, values, key);
      renderCards();
    });
    container.appendChild(button);
  });
}

function renderSources() {
  elements.sourceList.innerHTML = "";
  state.sources.forEach((source) => {
    elements.sourceList.appendChild(createSourceItem(source, "真实接入"));
  });

  state.pendingSources.forEach((source) => {
    elements.sourceList.appendChild(createSourceItem(source, "暂不接入"));
  });
}

function createSourceItem(source, status) {
  const item = document.createElement("div");
  item.className = "source-item";
  item.innerHTML = `
    <strong>${escapeHtml(source.name || "未命名来源")} · ${escapeHtml(source.type || "RSS")} · ${escapeHtml(status)}</strong>
    <span>${escapeHtml(source.group || "未分组")}</span>
    <span>${escapeHtml(source.url || "")}</span>
    ${source.reason ? `<span>${escapeHtml(source.reason)}</span>` : ""}
  `;
  return item;
}

function renderCards() {
  const items = getFilteredItems();
  elements.cardList.innerHTML = "";
  elements.resultCount.textContent = `${items.length} 条`;

  if (!items.length) {
    setStateMessage("没有符合筛选条件的资讯。");
    return;
  }

  elements.stateMessage.classList.add("hidden");

  items.forEach((item) => {
    const card = document.createElement("article");
    card.className = "news-card";
    card.innerHTML = `
      <div class="card-meta">
        <span class="source-tag">${escapeHtml(item.sourceType || "RSS")}</span>
        <span class="category-tag">${escapeHtml(item.category || "观点")}</span>
        <span class="time">${formatDateTime(item.publishedAt)}</span>
      </div>
      <div class="author-row">
        <span class="avatar">${escapeHtml(getInitials(item.author))}</span>
        <span class="author">${escapeHtml(item.author || "Unknown")}</span>
      </div>
      <h3>${escapeHtml(item.title || "无标题")}</h3>
      <p class="summary">${escapeHtml(item.summary || "暂无摘要。")}</p>
      ${item.whyItMatters ? `<p class="why">${escapeHtml(item.whyItMatters)}</p>` : ""}
      <div class="card-foot">
        <span class="group-name">${escapeHtml(item.group || "未分组")}</span>
        <a class="origin-link" href="${escapeAttribute(item.url || "#")}" target="_blank" rel="noreferrer">查看原文</a>
      </div>
    `;
    elements.cardList.appendChild(card);
  });
}

function getFilteredItems() {
  const now = Date.now();
  const maxAge = {
    today: 1000 * 60 * 60 * 24,
    "3d": 1000 * 60 * 60 * 24 * 3,
    week: 1000 * 60 * 60 * 24 * 7
  }[state.filters.date];

  return state.items.filter((item) => {
    const itemTime = new Date(item.publishedAt || 0).getTime();
    const inDateRange = Number.isFinite(itemTime) ? now - itemTime <= maxAge : true;
    const inGroup = state.filters.group === "全部" || item.group === state.filters.group;
    const inCategory = state.filters.category === "全部" || item.category === state.filters.category;
    return inDateRange && inGroup && inCategory;
  });
}

function setStateMessage(message) {
  elements.stateMessage.textContent = message;
  elements.stateMessage.classList.remove("hidden");
}

function setActive(buttons, activeButton) {
  buttons.forEach((button) => button.classList.toggle("active", button === activeButton));
}

function unique(values) {
  return [...new Set(values)];
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "时间未知";
  }
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function getInitials(name = "") {
  const trimmed = name.trim();
  if (!trimmed) {
    return "AI";
  }
  return trimmed.slice(0, 2).toUpperCase();
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value = "") {
  return escapeHtml(value).replaceAll("`", "&#096;");
}
