import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createClient } from "@redis/client";

const server = new McpServer({
  name: "redis-manager-mcp",
  version: "0.1.0",
});

const redis = createClient({
  url: process.env.REDIS_URL || "redis://localhost:6379",
});

// Connect to Redis
redis.connect().catch((err) => {
  console.error("Failed to connect to Redis:", err);
  process.exit(1);
});

// get: Get value of a key
server.registerTool(
  "get",
  {
    description: "Get the value of a key.",
    inputSchema: {
      key: z.string().describe("The key to retrieve."),
    },
  },
  async ({ key }) => {
    try {
      const value = await redis.get(key);
      return {
        content: [
          {
            type: "text",
            text: value !== null ? value : "null",
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error getting key: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// set: Set value of a key
server.registerTool(
  "set",
  {
    description: "Set the value of a key.",
    inputSchema: {
      key: z.string().describe("The key to set."),
      value: z.string().describe("The value to set."),
    },
  },
  async ({ key, value }) => {
    try {
      await redis.set(key, value);
      return {
        content: [
          {
            type: "text",
            text: "OK",
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error setting key: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// del: Delete a key
server.registerTool(
  "del",
  {
    description: "Delete a key.",
    inputSchema: {
      key: z.string().describe("The key to delete."),
    },
  },
  async ({ key }) => {
    try {
      const result = await redis.del(key);
      return {
        content: [
          {
            type: "text",
            text: result === 1 ? "OK" : "Key not found",
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error deleting key: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// list_keys: List keys matching a pattern
server.registerTool(
  "list_keys",
  {
    description: "List keys matching a pattern.",
    inputSchema: {
      pattern: z.string().optional().default("*").describe("The pattern to match. Default '*'."),
    },
  },
  async ({ pattern }) => {
    try {
      const keys = await redis.keys(pattern);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(keys, null, 2),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error listing keys: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Wire up stdio transport
const transport = new StdioServerTransport();
server.connect(transport);

// Graceful shutdown
process.on("SIGINT", async () => {
  await redis.quit();
  process.exit(0);
});
