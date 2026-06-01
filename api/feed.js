const { buildFeed } = require("../lib/feed");

module.exports = async function handler(request, response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Cache-Control", "s-maxage=900, stale-while-revalidate=3600");

  if (request.method && request.method !== "GET") {
    response.status(405).json({ error: "Method not allowed" });
    return;
  }

  const feed = await buildFeed();
  response.status(200).json(feed);
};
