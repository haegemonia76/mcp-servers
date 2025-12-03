import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import pg from "pg";

const server = new McpServer({
  name: "postgres-manager-mcp",
  version: "0.1.0",
});

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

// Helper to execute queries
async function query(text: string, params?: any[]) {
  const client = await pool.connect();
  try {
    return await client.query(text, params);
  } finally {
    client.release();
  }
}

// query: Run a read-only SQL query
server.registerTool(
  "query",
  {
    description: "Run a read-only SQL query against the Postgres database.",
    inputSchema: {
      sql: z.string().describe("The SQL query to execute."),
    },
  },
  async ({ sql }) => {
    // Check if write queries are allowed
    const allowWrite = process.env.PG_ALLOW_WRITE === "true";

    // Basic safety check for read-only queries if write is not explicitly allowed
    if (!allowWrite && !sql.trim().toLowerCase().startsWith("select")) {
      return {
        content: [
          {
            type: "text",
            text: "Error: Only SELECT queries are allowed for safety. Set PG_ALLOW_WRITE=true to enable write queries.",
          },
        ],
        isError: true,
      };
    }

    try {
      const result = await query(sql);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result.rows, null, 2),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error executing query: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// list_tables: List all tables in the database
server.registerTool(
  "list_tables",
  {
    description: "List all tables in the database.",
    inputSchema: {},
  },
  async () => {
    try {
      const sql = `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
        ORDER BY table_name;
      `;
      const result = await query(sql);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result.rows.map((r: any) => r.table_name), null, 2),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error listing tables: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// describe_table: Get schema information for a specific table
server.registerTool(
  "describe_table",
  {
    description: "Get schema information for a specific table.",
    inputSchema: {
      tableName: z.string().describe("The name of the table to describe."),
    },
  },
  async ({ tableName }) => {
    try {
      const sql = `
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_name = $1
        ORDER BY ordinal_position;
      `;
      const result = await query(sql, [tableName]);
      
      if (result.rows.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `Table "${tableName}" not found.`,
            },
          ],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result.rows, null, 2),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error describing table: ${error.message}`,
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
