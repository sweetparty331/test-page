const DEFAULT_ALIASES = {
  "梁文锋": ["梁文锋", "Liang Wenfeng"],
  "任正非": ["任正非", "Ren Zhengfei"],
  "周靖人": ["周靖人", "Jingren Zhou", "Zhou Jingren"],
  "陈天石": ["陈天石", "Tianshi Chen", "Chen Tianshi"],
  "何恺明": ["何恺明", "Kaiming He"],
  "李飞飞": ["李飞飞", "Fei-Fei Li", "Fei Fei Li"],
  "王兴兴": ["王兴兴", "Wang Xingxing"],
  "Sam Altman": ["Sam Altman"],
  "Elon Musk": ["Elon Musk"],
  "Dario Amodei": ["Dario Amodei"],
  "Demis Hassabis": ["Demis Hassabis"],
  "黄仁勋": ["黄仁勋", "Jensen Huang", "Jen-Hsun Huang"],
  "Mark Zuckerberg": ["Mark Zuckerberg"],
  "Yann LeCun": ["Yann LeCun", "LeCun"],
  "Ilya Sutskever": ["Ilya Sutskever"],
  "Andrew Ng": ["Andrew Ng"],
  "Andrej Karpathy": ["Andrej Karpathy", "Karpathy"]
};

function tagPeople(items, pendingSources = []) {
  const people = pendingSources
    .filter((source) => source.type === "Person")
    .map(createPersonProfile);

  if (!people.length) {
    return items;
  }

  return items.map((item) => {
    const text = normalize(`${item.title || ""} ${item.content || ""} ${item.author || ""}`);
    const matched = people.filter((person) => {
      return person.aliases.some((alias) => text.includes(normalize(alias)));
    });

    if (!matched.length) {
      return item;
    }

    return {
      ...item,
      people: unique([...(item.people || []), ...matched.map((person) => person.name)]),
      peopleGroups: unique([...(item.peopleGroups || []), ...matched.map((person) => person.group)])
    };
  });
}

function createPersonProfile(source) {
  return {
    name: source.name,
    group: source.group || "AI大佬",
    aliases: unique([source.name, ...(DEFAULT_ALIASES[source.name] || []), ...(source.aliases || [])])
      .filter((alias) => String(alias || "").trim().length >= 3)
  };
}

function normalize(value = "") {
  return String(value).replace(/\s+/g, " ").trim().toLowerCase();
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

module.exports = {
  tagPeople
};
