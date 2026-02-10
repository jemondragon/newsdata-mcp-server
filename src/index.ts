import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import express from "express";
import { z } from "zod";

// ─── Configuration ───────────────────────────────────────────────────────────

const API_BASE = "https://newsdata.io/api/1";
const API_KEY = process.env.NEWSDATA_API_KEY || "";
const CHARACTER_LIMIT = 50000;

// ─── Types ───────────────────────────────────────────────────────────────────

interface NewsArticle {
  article_id: string;
  title: string;
  link: string;
  description: string | null;
  content: string | null;
  pubDate: string;
  pubDateTZ: string;
  source_id: string;
  source_name: string;
  source_url: string;
  source_icon: string | null;
  language: string;
  country: string[];
  category: string[];
  image_url: string | null;
  ai_tag: string | null;
  ai_region: string | null;
  ai_org: string | null;
  sentiment: string | null;
  sentiment_stats: string | null;
  creator: string[] | null;
  keywords: string[] | null;
  coin: string[] | null;
  duplicate: boolean;
}

interface NewsApiResponse {
  status: string;
  totalResults: number;
  results: NewsArticle[];
  nextPage?: string;
}

interface SourceInfo {
  id: string;
  name: string;
  url: string;
  icon: string | null;
  priority: number;
  description: string | null;
  category: string[];
  language: string[];
  country: string[];
  last_fetch: string;
}

interface SourcesApiResponse {
  status: string;
  totalResults: number;
  results: SourceInfo[];
}

// ─── API Client ──────────────────────────────────────────────────────────────

async function fetchNewsData(
  endpoint: string,
  params: Record<string, string | number | undefined>
): Promise<unknown> {
  if (!API_KEY) {
    throw new Error(
      "NEWSDATA_API_KEY environment variable is not set. Get your key at https://newsdata.io"
    );
  }

  const url = new URL(`${API_BASE}/${endpoint}`);
  url.searchParams.set("apikey", API_KEY);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url.toString());

  if (!response.ok) {
    const errorBody = await response.text();
    if (response.status === 401) {
      throw new Error("Invalid API key. Check your NEWSDATA_API_KEY.");
    }
    if (response.status === 429) {
      throw new Error(
        "Rate limit exceeded. Wait before making more requests or upgrade your plan."
      );
    }
    throw new Error(
      `NewsData API error (${response.status}): ${errorBody}`
    );
  }

  return response.json();
}

// ─── Formatting Helpers ──────────────────────────────────────────────────────

function formatArticle(article: NewsArticle, index: number): string {
  const parts: string[] = [];
  parts.push(`## ${index}. ${article.title || "Untitled"}`);
  parts.push(`**Source:** ${article.source_name} | **Date:** ${article.pubDate}`);

  if (article.creator?.length) {
    parts.push(`**Author:** ${article.creator.join(", ")}`);
  }
  if (article.category?.length) {
    parts.push(`**Category:** ${article.category.join(", ")}`);
  }
  if (article.country?.length) {
    parts.push(`**Country:** ${article.country.join(", ")}`);
  }
  if (article.sentiment) {
    parts.push(`**Sentiment:** ${article.sentiment}`);
  }
  if (article.keywords?.length) {
    parts.push(`**Keywords:** ${article.keywords.join(", ")}`);
  }
  if (article.coin?.length) {
    parts.push(`**Coins:** ${article.coin.join(", ")}`);
  }
  if (article.ai_tag) {
    parts.push(`**AI Tags:** ${article.ai_tag}`);
  }
  if (article.description) {
    parts.push(`\n${article.description}`);
  }
  if (article.link) {
    parts.push(`\n🔗 ${article.link}`);
  }

  return parts.join("\n");
}

function formatArticles(data: NewsApiResponse): string {
  if (!data.results?.length) {
    return "No articles found matching your query.";
  }

  const header = `# News Results (${data.totalResults} total)\n`;
  let output = header;

  for (let i = 0; i < data.results.length; i++) {
    const formatted = formatArticle(data.results[i], i + 1);
    if (output.length + formatted.length > CHARACTER_LIMIT) {
      output += `\n\n---\n*Truncated: ${data.results.length - i} more articles available.*`;
      break;
    }
    output += "\n\n" + formatted;
  }

  if (data.nextPage) {
    output += `\n\n---\n**Next page token:** \`${data.nextPage}\`\nUse this value in the \`page\` parameter to get the next batch of results.`;
  }

  return output;
}

function formatSources(data: SourcesApiResponse): string {
  if (!data.results?.length) {
    return "No sources found matching your query.";
  }

  const header = `# News Sources (${data.totalResults} total)\n`;
  let output = header;

  for (const src of data.results) {
    const entry = [
      `- **${src.name}** (${src.id})`,
      `  URL: ${src.url}`,
      src.category?.length ? `  Categories: ${src.category.join(", ")}` : null,
      src.language?.length ? `  Languages: ${src.language.join(", ")}` : null,
      src.country?.length ? `  Countries: ${src.country.join(", ")}` : null,
      src.description ? `  ${src.description}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    if (output.length + entry.length > CHARACTER_LIMIT) {
      output += "\n\n*Truncated: more sources available.*";
      break;
    }
    output += "\n" + entry;
  }

  return output;
}

// ─── Shared Schemas ──────────────────────────────────────────────────────────

const CommonNewsParams = {
  q: z
    .string()
    .max(512)
    .optional()
    .describe("Search keywords. Use AND/OR/NOT operators. Example: 'bitcoin AND ethereum'"),
  qInTitle: z
    .string()
    .max(512)
    .optional()
    .describe("Search keywords in article titles only"),
  qInMeta: z
    .string()
    .max(512)
    .optional()
    .describe("Search keywords in title, URL, and meta description"),
  country: z
    .string()
    .optional()
    .describe("Comma-separated country codes. Example: 'us,gb,ca'"),
  category: z
    .string()
    .optional()
    .describe(
      "Comma-separated categories: business, crime, domestic, education, entertainment, environment, food, health, lifestyle, other, politics, science, sports, technology, top, tourism, world"
    ),
  language: z
    .string()
    .optional()
    .describe("Comma-separated language codes. Example: 'en,es,fr'"),
  domain: z
    .string()
    .optional()
    .describe("Comma-separated source domains. Example: 'bbc.co.uk,cnn.com'"),
  domainurl: z
    .string()
    .optional()
    .describe("Comma-separated full domain URLs"),
  excludedomain: z
    .string()
    .optional()
    .describe("Comma-separated domains to exclude"),
  prioritydomain: z
    .enum(["top", "medium", "low"])
    .optional()
    .describe("Filter by domain priority: top (top 10%), medium (top 30%), low (top 50%)"),
  timezone: z
    .string()
    .optional()
    .describe("Timezone for results. Example: 'America/New_York'"),
  image: z
    .enum(["1", "0"])
    .optional()
    .describe("Filter articles with (1) or without (0) images"),
  video: z
    .enum(["1", "0"])
    .optional()
    .describe("Filter articles with (1) or without (0) videos"),
  sentiment: z
    .enum(["positive", "negative", "neutral"])
    .optional()
    .describe("Filter by article sentiment"),
  removeduplicate: z
    .enum(["1"])
    .optional()
    .describe("Set to '1' to remove duplicate articles"),
  size: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe("Number of articles per request (free: max 10, paid: max 50)"),
  page: z
    .string()
    .optional()
    .describe("Pagination token from previous response's nextPage value"),
};

// ─── Server Setup ────────────────────────────────────────────────────────────

function createServer(): McpServer {
  const server = new McpServer({
    name: "newsdata-mcp-server",
    version: "1.0.0",
  });

  // ── Tool: Latest News ──────────────────────────────────────────────────────
  server.registerTool(
    "newsdata_latest",
    {
      title: "Latest News",
      description: `Fetch the latest news articles from the past 48 hours worldwide.

Supports keyword search, country/language/category filtering, sentiment analysis, and pagination.
Returns up to 50 articles per request (10 for free plans).

Args:
  - q: Search keywords (supports AND/OR/NOT operators)
  - qInTitle: Search in titles only
  - country: Filter by country codes (e.g., 'us,gb')
  - category: Filter by category (e.g., 'business,technology')
  - language: Filter by language (e.g., 'en')
  - sentiment: Filter by sentiment (positive/negative/neutral)
  - timeframe: Lookback in hours (1-48) or minutes (e.g., '120m')
  - size: Results per page (1-50)
  - page: Pagination token from previous response

Examples:
  - Latest US tech news: q="technology", country="us"
  - Breaking news last 2 hours: timeframe=2
  - Positive AI news: q="artificial intelligence", sentiment="positive"`,
      inputSchema: {
        ...CommonNewsParams,
        timeframe: z
          .string()
          .optional()
          .describe("Lookback period: hours (1-48) or minutes (e.g., '120m')"),
        tag: z
          .string()
          .optional()
          .describe("Filter by AI-detected tags"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      const data = await fetchNewsData("latest", params as Record<string, string | number | undefined>);
      const text = formatArticles(data as NewsApiResponse);
      return { content: [{ type: "text", text }] };
    }
  );

  // ── Tool: Crypto News ──────────────────────────────────────────────────────
  server.registerTool(
    "newsdata_crypto",
    {
      title: "Crypto News",
      description: `Fetch cryptocurrency-specific news articles.

Dedicated endpoint for crypto/blockchain news with coin-specific filtering.
Returns articles tagged with cryptocurrency topics from the past 48 hours.

Args:
  - q: Search keywords (e.g., 'bitcoin', 'ethereum defi')
  - coin: Filter by specific coin (e.g., 'BTC,ETH,SOL')
  - country, language, category: Standard filters
  - sentiment: Filter by sentiment
  - timeframe: Lookback in hours (1-48) or minutes
  - size: Results per page
  - page: Pagination token

Examples:
  - Bitcoin news: q="bitcoin" or coin="BTC"
  - DeFi news in English: q="defi", language="en"
  - Negative crypto sentiment: sentiment="negative"`,
      inputSchema: {
        ...CommonNewsParams,
        coin: z
          .string()
          .optional()
          .describe("Comma-separated coin symbols. Example: 'BTC,ETH,SOL,DOGE'"),
        timeframe: z
          .string()
          .optional()
          .describe("Lookback period: hours (1-48) or minutes (e.g., '120m')"),
        tag: z
          .string()
          .optional()
          .describe("Filter by AI-detected tags"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      const data = await fetchNewsData("crypto", params as Record<string, string | number | undefined>);
      const text = formatArticles(data as NewsApiResponse);
      return { content: [{ type: "text", text }] };
    }
  );

  // ── Tool: News Archive ─────────────────────────────────────────────────────
  server.registerTool(
    "newsdata_archive",
    {
      title: "News Archive",
      description: `Search historical news articles (paid plans only).

Access archived news with date range filtering. Useful for research and historical analysis.

Args:
  - q: Search keywords
  - from_date: Start date (YYYY-MM-DD or YYYY-MM-DD HH:MM:SS)
  - to_date: End date (YYYY-MM-DD or YYYY-MM-DD HH:MM:SS)
  - country, language, category: Standard filters
  - size: Results per page
  - page: Pagination token

Examples:
  - News about Tesla in January 2025: q="tesla", from_date="2025-01-01", to_date="2025-01-31"
  - Historical crypto coverage: q="bitcoin", from_date="2024-01-01", to_date="2024-12-31"`,
      inputSchema: {
        ...CommonNewsParams,
        from_date: z
          .string()
          .optional()
          .describe("Start date: YYYY-MM-DD or YYYY-MM-DD HH:MM:SS"),
        to_date: z
          .string()
          .optional()
          .describe("End date: YYYY-MM-DD or YYYY-MM-DD HH:MM:SS"),
        tag: z
          .string()
          .optional()
          .describe("Filter by AI-detected tags"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      const data = await fetchNewsData("archive", params as Record<string, string | number | undefined>);
      const text = formatArticles(data as NewsApiResponse);
      return { content: [{ type: "text", text }] };
    }
  );

  // ── Tool: Market News ──────────────────────────────────────────────────────
  server.registerTool(
    "newsdata_market",
    {
      title: "Market News",
      description: `Fetch financial and stock market news (beta endpoint).

Get real-time market news including stock analysis, financial sentiment, and business mergers.
Returns articles from the past 48 hours.

Args:
  - q: Search keywords (e.g., 'AAPL', 'stock market')
  - symbol: Stock ticker symbols (e.g., 'AAPL,MSFT,GOOGL')
  - country, language: Standard filters
  - sentiment: Filter by financial sentiment
  - timeframe: Lookback in hours (1-48) or minutes
  - size: Results per page
  - page: Pagination token

Examples:
  - Apple stock news: symbol="AAPL"
  - Market crash coverage: q="market crash", sentiment="negative"
  - Tech earnings: q="earnings report", category="business"`,
      inputSchema: {
        ...CommonNewsParams,
        symbol: z
          .string()
          .optional()
          .describe("Comma-separated stock ticker symbols. Example: 'AAPL,MSFT,GOOGL'"),
        timeframe: z
          .string()
          .optional()
          .describe("Lookback period: hours (1-48) or minutes (e.g., '120m')"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      const data = await fetchNewsData("market", params as Record<string, string | number | undefined>);
      const text = formatArticles(data as NewsApiResponse);
      return { content: [{ type: "text", text }] };
    }
  );

  // ── Tool: News Sources ─────────────────────────────────────────────────────
  server.registerTool(
    "newsdata_sources",
    {
      title: "News Sources",
      description: `List available news sources with filtering options.

Browse and discover news sources indexed by NewsData.io, filtered by country, language, or category.

Args:
  - country: Filter sources by country code (e.g., 'us')
  - language: Filter sources by language (e.g., 'en')
  - category: Filter sources by category (e.g., 'technology')
  - prioritydomain: Filter by source priority tier
  - domainurl: Search for specific domain

Examples:
  - English tech sources: language="en", category="technology"
  - US news sources: country="us"
  - Top-tier sources: prioritydomain="top"`,
      inputSchema: {
        country: z.string().optional().describe("Country code filter. Example: 'us'"),
        language: z.string().optional().describe("Language code filter. Example: 'en'"),
        category: z
          .string()
          .optional()
          .describe("Category filter: business, entertainment, health, science, sports, technology, etc."),
        prioritydomain: z
          .enum(["top", "medium", "low"])
          .optional()
          .describe("Filter by domain priority tier"),
        domainurl: z.string().optional().describe("Search for a specific domain URL"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      const data = await fetchNewsData("sources", params as Record<string, string | number | undefined>);
      const text = formatSources(data as SourcesApiResponse);
      return { content: [{ type: "text", text }] };
    }
  );

  return server;
}

// ─── Transport: Streamable HTTP ──────────────────────────────────────────────

async function runHTTP(): Promise<void> {
  const app = express();
  app.use(express.json());

  app.post("/mcp", async (req, res) => {
    const server = createServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on("close", () => transport.close());
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  // Health check
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", server: "newsdata-mcp-server", version: "1.0.0" });
  });

  const port = parseInt(process.env.PORT || "3000");
  app.listen(port, () => {
    console.error(`NewsData MCP server running on http://localhost:${port}/mcp`);
  });
}

// ─── Transport: stdio ────────────────────────────────────────────────────────

async function runStdio(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("NewsData MCP server running on stdio");
}

// ─── Entry Point ─────────────────────────────────────────────────────────────

const transport = process.env.TRANSPORT || "stdio";
if (transport === "http") {
  runHTTP().catch((error) => {
    console.error("Server error:", error);
    process.exit(1);
  });
} else {
  runStdio().catch((error) => {
    console.error("Server error:", error);
    process.exit(1);
  });
}
