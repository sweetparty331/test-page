const state = {
  items: [],
  sources: [],
  pendingSources: [],
  favoriteKeys: loadFavorites(),
  filters: {
    group: "全部",
    category: "全部",
    date: "30d",
    favoritesOnly: false,
    search: ""
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
      originalTitle: "New model capability update",
      summary: "这条更新强调模型推理、工具调用和多模态体验的稳定性提升，适合关注 AI 产品落地的人快速判断是否会影响现有工作流。",
      summaryEn: "The update focuses on more reliable reasoning, tool use, and multimodal product experiences.",
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
      originalTitle: "AI inference efficiency optimization",
      summary: "推理效率优化正在从单纯压缩模型转向系统级调度、缓存和部署策略，核心价值是帮助企业在更低成本下获得稳定 AI 能力。",
      summaryEn: "Inference efficiency is shifting from model compression to system scheduling and caching.",
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
      originalTitle: "New paper on agent evaluation",
      summary: "这篇论文关注 Agent 评测方法，重点不再只是任务数量，而是环境真实性、可复现性和业务迁移价值。",
      summaryEn: "The paper argues that agent benchmarks need realistic environments and reproducible tasks.",
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
  sourceList: document.querySelector("#sourceList"),
  searchInput: document.querySelector("#searchInput"),
  favoritesToggle: document.querySelector("#favoritesToggle"),
  overviewPanel: document.querySelector("#overviewPanel")
};

elements.refreshButton.addEventListener("click", () => loadFeed(true));
elements.settingsButton.addEventListener("click", () => elements.settingsDialog.showModal());
elements.searchInput.addEventListener("input", () => {
  state.filters.search = elements.searchInput.value.trim();
  renderCards();
});
elements.favoritesToggle.addEventListener("click", () => {
  state.filters.favoritesOnly = !state.filters.favoritesOnly;
  elements.favoritesToggle.classList.toggle("active", state.filters.favoritesOnly);
  renderCards();
});

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
    button.innerHTML = `
      <span>${escapeHtml(value)}</span>
      <span class="chip-count">${getFilterCount(key, value)}</span>
    `;
    button.addEventListener("click", () => {
      state.filters[key] = value;
      renderFilterButtons(container, values, key);
      renderCards();
    });
    container.appendChild(button);
  });
}

function getFilterCount(key, value) {
  if (value === "全部") {
    return state.items.length;
  }

  return state.items.filter((item) => item[key] === value).length;
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
  renderOverview(items);

  if (!items.length) {
    setEmptyState();
    return;
  }

  elements.stateMessage.classList.add("hidden");

  items.forEach((item) => {
    const itemKey = getItemKey(item);
    const isFavorite = state.favoriteKeys.has(itemKey);
    const card = document.createElement("article");
    card.className = "news-card";
    card.innerHTML = `
      <div class="card-meta">
        <div class="card-tags">
          <span class="source-tag">${escapeHtml(item.sourceType || "RSS")}</span>
          <span class="category-tag">${escapeHtml(item.category || "观点")}</span>
          <span class="time">${formatDateTime(item.publishedAt)}</span>
        </div>
        <button class="favorite-button${isFavorite ? " active" : ""}" type="button" aria-label="${isFavorite ? "取消收藏" : "收藏"}">${isFavorite ? "★" : "☆"}</button>
      </div>
      <div class="author-row">
        <span class="avatar">${escapeHtml(getInitials(item.author))}</span>
        <span class="author">${escapeHtml(item.author || "Unknown")}</span>
      </div>
      <h3>${escapeHtml(item.title || "无标题")}</h3>
      ${item.originalTitle && item.originalTitle !== item.title ? `<p class="original-title">${escapeHtml(item.originalTitle)}</p>` : ""}
      <div class="bilingual-summary">
        <p class="summary"><strong>中文</strong>${escapeHtml(item.summary || "暂无摘要。")}</p>
        <p class="summary-en"><strong>English</strong>${escapeHtml(item.summaryEn || item.originalTitle || item.summary || "No English summary available.")}</p>
      </div>
      ${item.whyItMatters ? `<p class="why">${escapeHtml(item.whyItMatters)}</p>` : ""}
      <div class="card-foot">
        <span class="group-name">${escapeHtml(item.group || "未分组")}</span>
        <a class="origin-link" href="${escapeAttribute(item.url || "#")}" target="_blank" rel="noreferrer">查看原文</a>
      </div>
    `;
    card.querySelector(".favorite-button").addEventListener("click", () => toggleFavorite(item));
    elements.cardList.appendChild(card);
  });
}

function renderOverview(items) {
  if (!items.length) {
    elements.overviewPanel.classList.add("hidden");
    elements.overviewPanel.innerHTML = "";
    return;
  }

  const today = new Date();
  const rangeLabel = {
    today: "今日",
    "3d": "近3日",
    "30d": "近30日"
  }[state.filters.date] || "当前";
  const topCategories = Object.entries(countBy(items, "category"))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([category, count]) => `<span>${escapeHtml(category)} ${count}</span>`)
    .join("");

  const headlines = items.slice(0, 2).map((item) => {
    return `<span>${escapeHtml(shorten(item.title || "无标题", 22))}</span>`;
  }).join("");

  const previewItems = items.slice(0, 5).map((item) => {
    return `<li><strong>${escapeHtml(shorten(item.title || "无标题", 24))}</strong><span>${escapeHtml(shorten(item.summary || "", 66))}</span></li>`;
  }).join("");

  elements.overviewPanel.classList.remove("hidden");
  elements.overviewPanel.innerHTML = `
    <div class="overview-card" tabindex="0" aria-label="${escapeAttribute(rangeLabel)}资讯预览">
      <div class="date-tile" aria-hidden="true">
        <span>${formatMonth(today)}</span>
        <strong>${String(today.getDate()).padStart(2, "0")}</strong>
        <span>${formatWeekday(today)}</span>
      </div>
      <div class="overview-main">
        <div class="overview-line">
          <span class="eyebrow">资讯日历</span>
          <strong>${escapeHtml(rangeLabel)} ${items.length} 条</strong>
        </div>
        <div class="overview-chips">${topCategories || "<span>资讯更新</span>"}</div>
        <div class="overview-headlines">${headlines}</div>
      </div>
      <span class="overview-hint">悬停预览</span>
      <div class="overview-popover" role="tooltip">
        <strong>${escapeHtml(rangeLabel)}资讯</strong>
        <ul>${previewItems}</ul>
      </div>
    </div>
  `;
}

function getFilteredItems() {
  const now = Date.now();
  const maxAge = {
    today: 1000 * 60 * 60 * 24,
    "3d": 1000 * 60 * 60 * 24 * 3,
    "30d": 1000 * 60 * 60 * 24 * 30
  }[state.filters.date];

  return state.items.filter((item) => {
    const itemTime = new Date(item.publishedAt || 0).getTime();
    const inDateRange = Number.isFinite(itemTime) ? now - itemTime <= maxAge : true;
    const inGroup = state.filters.group === "全部" || item.group === state.filters.group;
    const inCategory = state.filters.category === "全部" || item.category === state.filters.category;
    const inFavorites = !state.filters.favoritesOnly || state.favoriteKeys.has(getItemKey(item));
    const inSearch = matchesSearch(item);
    return inDateRange && inGroup && inCategory && inFavorites && inSearch;
  });
}

function matchesSearch(item) {
  if (!state.filters.search) {
    return true;
  }

  const keyword = state.filters.search.toLowerCase();
  return [
    item.title,
    item.originalTitle,
    item.summary,
    item.summaryEn,
    item.whyItMatters,
    item.author,
    item.category,
    item.group
  ].some((value) => String(value || "").toLowerCase().includes(keyword));
}

function setStateMessage(message) {
  elements.stateMessage.textContent = message;
  elements.stateMessage.classList.remove("hidden");
}

function setEmptyState() {
  elements.stateMessage.innerHTML = `
    <span>当前筛选下没有资讯，通常是因为时间或类型筛选太窄。</span>
    <button class="inline-reset" type="button">查看全部近30日资讯</button>
  `;
  elements.stateMessage.classList.remove("hidden");
  elements.stateMessage.querySelector(".inline-reset").addEventListener("click", resetFilters);
}

function resetFilters() {
  state.filters.group = "全部";
  state.filters.category = "全部";
  state.filters.date = "30d";
  state.filters.favoritesOnly = false;
  state.filters.search = "";
  elements.searchInput.value = "";
  elements.favoritesToggle.classList.remove("active");
  renderFilters();
  setActive(document.querySelectorAll("[data-date]"), document.querySelector("[data-date='30d']"));
  renderCards();
}

function setActive(buttons, activeButton) {
  buttons.forEach((button) => button.classList.toggle("active", button === activeButton));
}

function unique(values) {
  return [...new Set(values)];
}

function countBy(items, key) {
  return items.reduce((counts, item) => {
    const value = item[key] || "其他";
    counts[value] = (counts[value] || 0) + 1;
    return counts;
  }, {});
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

function formatMonth(date) {
  return new Intl.DateTimeFormat("zh-CN", { month: "short" }).format(date);
}

function formatWeekday(date) {
  return new Intl.DateTimeFormat("zh-CN", { weekday: "short" }).format(date);
}

function getInitials(name = "") {
  const trimmed = name.trim();
  if (!trimmed) {
    return "AI";
  }
  return trimmed.slice(0, 2).toUpperCase();
}

function shorten(text = "", maxLength) {
  const normalized = String(text).replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1)}…`;
}

function getItemKey(item) {
  return item.dedupeKey || item.url || item.title || "";
}

function toggleFavorite(item) {
  const key = getItemKey(item);
  if (!key) {
    return;
  }

  if (state.favoriteKeys.has(key)) {
    state.favoriteKeys.delete(key);
  } else {
    state.favoriteKeys.add(key);
  }

  saveFavorites();
  renderCards();
}

function loadFavorites() {
  try {
    return new Set(JSON.parse(localStorage.getItem("aiDailyPulseFavorites") || "[]"));
  } catch (error) {
    return new Set();
  }
}

function saveFavorites() {
  try {
    localStorage.setItem("aiDailyPulseFavorites", JSON.stringify([...state.favoriteKeys]));
  } catch (error) {
    // 收藏是本地增强能力；浏览器禁用存储时保持页面可用。
  }
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
