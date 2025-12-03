import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import Docker from "dockerode";

const docker = new Docker(); // uses local /var/run/docker.sock by default

// --- Create MCP server ---

const server = new McpServer({
  name: "docker-manager-mcp",
  version: "0.1.0",
});

// --- Define tools ---

// list_containers: show running/all containers
server.registerTool(
  "list_containers",
  {
    description: "List Docker containers. Optional filter: { all: boolean } to include stopped containers.",
    inputSchema: {
      all: z.boolean().optional().describe("If true, include stopped containers (docker ps -a)"),
    },
  },
  async ({ all }) => {
    const containers = await docker.listContainers({ all: all ?? false });

    // minimal projection
    const data = containers.map((c) => ({
      id: c.Id,
      names: c.Names,
      image: c.Image,
      state: c.State,
      status: c.Status,
      created: c.Created,
      ports: c.Ports?.map((p) => ({
        private: p.PrivatePort,
        public: p.PublicPort,
        type: p.Type,
        ip: p.IP,
      })),
    }));

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(data, null, 2),
        },
      ],
    };
  }
);

// start_container: docker start <id or name>
server.registerTool(
  "start_container",
  {
    description: "Start a Docker container by id or name.",
    inputSchema: {
      idOrName: z.string().describe("Container ID or name."),
    },
  },
  async ({ idOrName }) => {
    const container = docker.getContainer(idOrName);
    await container.start();

    return {
      content: [
        {
          type: "text",
          text: `Container "${idOrName}" started successfully.`,
        },
      ],
    };
  }
);

// stop_container: docker stop <id or name>
server.registerTool(
  "stop_container",
  {
    description: "Stop a Docker container by id or name.",
    inputSchema: {
      idOrName: z.string().describe("Container ID or name."),
      timeoutSeconds: z.number().optional().default(10).describe("Timeout in seconds before killing the container (SIGKILL). Default 10."),
    },
  },
  async ({ idOrName, timeoutSeconds }) => {
    const container = docker.getContainer(idOrName);
    await container.stop({ t: timeoutSeconds });

    return {
      content: [
        {
          type: "text",
          text: `Container "${idOrName}" stopped (timeout=${timeoutSeconds}s).`,
        },
      ],
    };
  }
);

// restart_container
server.registerTool(
  "restart_container",
  {
    description: "Restart a Docker container by id or name.",
    inputSchema: {
      idOrName: z.string().describe("Container ID or name."),
      timeoutSeconds: z.number().optional().default(10).describe("Timeout in seconds before killing the container on stop. Default 10."),
    },
  },
  async ({ idOrName, timeoutSeconds }) => {
    const container = docker.getContainer(idOrName);
    await container.restart({ t: timeoutSeconds });

    return {
      content: [
        {
          type: "text",
          text: `Container "${idOrName}" restarted (timeout=${timeoutSeconds}s).`,
        },
      ],
    };
  }
);

// Wire up stdio transport (what MCP clients expect)
const transport = new StdioServerTransport();
server.connect(transport);
