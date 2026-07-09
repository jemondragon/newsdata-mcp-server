# NewsData.io MCP Server

An MCP (Model Context Protocol) server that connects [NewsData.io](https://newsdata.io) to Claude and other LLM clients. Search latest news, crypto news, market news, historical archives, and browse news sources — all from within your AI assistant.

## Features

| Tool | Description |
|------|-------------|
| `newsdata_latest` | Latest news from the past 48 hours with full filtering |
| `newsdata_crypto` | Cryptocurrency-specific news with coin filtering |
| `newsdata_market` | Financial/stock market news (beta) with ticker symbols |
| `newsdata_archive` | Historical news search with date ranges (paid plans) |
| `newsdata_sources` | Browse available news sources by country/language/category |

All tools support: keyword search (AND/OR/NOT), country, language, category, domain, sentiment, pagination, and deduplication filters.

## Prerequisites

1. **Node.js** 18+ installed
2. **NewsData.io API key** — sign up at [newsdata.io](https://newsdata.io), then copy your key from the [search dashboard](https://newsdata.io/search-dashboard)

## Setup

### 1. Install dependencies

```bash
cd newsdata-mcp-server
npm install
npm run build
```

### 2. Set your API key

Copy your API key from the [NewsData.io search dashboard](https://newsdata.io/search-dashboard), then:

```bash
export NEWSDATA_API_KEY="your_api_key_here"
```

### 3. Connect to Claude

#### Claude Desktop App (stdio mode — recommended for desktop)

Add to your Claude Desktop config file:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "newsdata": {
      "command": "node",
      "args": ["/path/to/newsdata-mcp-server/dist/index.js"],
      "env": {
        "NEWSDATA_API_KEY": "your_api_key_here"
      }
    }
  }
}
```

#### Claude.ai Web (HTTP mode)

Run as an HTTP server:

```bash
TRANSPORT=http PORT=3000 NEWSDATA_API_KEY="your_key" node dist/index.js
```

The MCP endpoint will be available at `http://localhost:3000/mcp`

#### Claude Code (stdio mode)

```bash
claude mcp add newsdata -- node /path/to/newsdata-mcp-server/dist/index.js
```

Set the env variable `NEWSDATA_API_KEY` in your shell before running.

## Usage Examples

Once connected, just ask Claude naturally:

- "What's the latest news about AI?"
- "Show me crypto news for Bitcoin and Ethereum"
- "Find market news about AAPL and MSFT"
- "Search for climate change news from US sources in the last 6 hours"
- "List top English technology news sources"
- "Find positive sentiment news about renewable energy"

## API Endpoints Covered

| Endpoint | Tool | Plan Required |
|----------|------|---------------|
| `/api/1/latest` | `newsdata_latest` | Free+ |
| `/api/1/crypto` | `newsdata_crypto` | Basic+ |
| `/api/1/market` | `newsdata_market` | Basic+ |
| `/api/1/archive` | `newsdata_archive` | Professional+ |
| `/api/1/sources` | `newsdata_sources` | Free+ |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEWSDATA_API_KEY` | Yes | Your NewsData.io API key |
| `TRANSPORT` | No | `stdio` (default) or `http` |
| `PORT` | No | HTTP port (default: 3000) |

## License

MIT
