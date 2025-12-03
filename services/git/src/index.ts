import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { simpleGit } from "simple-git";

const server = new McpServer({
  name: "git-manager-mcp",
  version: "0.1.0",
});

// Get repository path from environment or use current directory
const repoPath = process.env.GIT_REPO_PATH || process.cwd();
const git = simpleGit(repoPath);

// git_status: Show working tree status
server.registerTool(
  "git_status",
  {
    description: "Show the working tree status (git status).",
    inputSchema: {},
  },
  async () => {
    try {
      const status = await git.status();
      
      const summary = {
        current: status.current,
        tracking: status.tracking,
        ahead: status.ahead,
        behind: status.behind,
        modified: status.modified,
        created: status.created,
        deleted: status.deleted,
        renamed: status.renamed,
        staged: status.staged,
        conflicted: status.conflicted,
        isClean: status.isClean(),
      };

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(summary, null, 2),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error getting status: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// git_log: Show commit history
server.registerTool(
  "git_log",
  {
    description: "Show commit history (git log).",
    inputSchema: {
      maxCount: z.number().optional().default(10).describe("Maximum number of commits to show. Default 10."),
    },
  },
  async ({ maxCount }) => {
    try {
      const log = await git.log({ maxCount });
      
      const commits = log.all.map((commit) => ({
        hash: commit.hash,
        date: commit.date,
        message: commit.message,
        author: commit.author_name,
        email: commit.author_email,
      }));

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(commits, null, 2),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error getting log: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// git_diff: Show changes
server.registerTool(
  "git_diff",
  {
    description: "Show changes between commits, commit and working tree, etc (git diff).",
    inputSchema: {
      cached: z.boolean().optional().default(false).describe("Show staged changes (--cached)."),
    },
  },
  async ({ cached }) => {
    try {
      const diff = cached ? await git.diff(["--cached"]) : await git.diff();

      return {
        content: [
          {
            type: "text",
            text: diff || "No changes",
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error getting diff: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// git_branch: List/create/delete branches
server.registerTool(
  "git_branch",
  {
    description: "List, create, or delete branches.",
    inputSchema: {
      action: z.enum(["list", "create", "delete"]).describe("Action to perform."),
      branchName: z.string().optional().describe("Branch name (required for create/delete)."),
    },
  },
  async ({ action, branchName }) => {
    try {
      if (action === "list") {
        const branches = await git.branch();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                current: branches.current,
                all: branches.all,
              }, null, 2),
            },
          ],
        };
      } else if (action === "create") {
        if (!branchName) {
          return {
            content: [{ type: "text", text: "Error: branchName is required for create action." }],
            isError: true,
          };
        }
        await git.checkoutLocalBranch(branchName);
        return {
          content: [{ type: "text", text: `Branch "${branchName}" created and checked out.` }],
        };
      } else if (action === "delete") {
        if (!branchName) {
          return {
            content: [{ type: "text", text: "Error: branchName is required for delete action." }],
            isError: true,
          };
        }
        await git.deleteLocalBranch(branchName);
        return {
          content: [{ type: "text", text: `Branch "${branchName}" deleted.` }],
        };
      }

      return {
        content: [{ type: "text", text: "Unknown action" }],
        isError: true,
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error with branch operation: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// git_checkout: Switch branches
server.registerTool(
  "git_checkout",
  {
    description: "Switch branches or restore working tree files (git checkout).",
    inputSchema: {
      branch: z.string().describe("Branch name to checkout."),
    },
  },
  async ({ branch }) => {
    try {
      await git.checkout(branch);
      return {
        content: [
          {
            type: "text",
            text: `Switched to branch "${branch}".`,
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error checking out branch: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// git_add: Stage files
server.registerTool(
  "git_add",
  {
    description: "Add file contents to the index (git add).",
    inputSchema: {
      files: z.string().describe("Files to add (e.g., '.' for all, or specific file paths)."),
    },
  },
  async ({ files }) => {
    try {
      await git.add(files);
      return {
        content: [
          {
            type: "text",
            text: `Files added: ${files}`,
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error adding files: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// git_commit: Create commit
server.registerTool(
  "git_commit",
  {
    description: "Record changes to the repository (git commit).",
    inputSchema: {
      message: z.string().describe("Commit message."),
    },
  },
  async ({ message }) => {
    try {
      const result = await git.commit(message);
      return {
        content: [
          {
            type: "text",
            text: `Commit created: ${result.commit}\n${result.summary.changes} files changed, ${result.summary.insertions} insertions(+), ${result.summary.deletions} deletions(-)`,
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error creating commit: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// git_push: Push to remote
server.registerTool(
  "git_push",
  {
    description: "Update remote refs along with associated objects (git push).",
    inputSchema: {
      remote: z.string().optional().default("origin").describe("Remote name. Default 'origin'."),
      branch: z.string().optional().describe("Branch name. If not specified, pushes current branch."),
    },
  },
  async ({ remote, branch }) => {
    try {
      const result = branch 
        ? await git.push(remote, branch)
        : await git.push(remote);
      
      return {
        content: [
          {
            type: "text",
            text: `Pushed to ${remote}${branch ? `/${branch}` : ''}`,
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error pushing: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// git_pull: Pull from remote
server.registerTool(
  "git_pull",
  {
    description: "Fetch from and integrate with another repository or a local branch (git pull).",
    inputSchema: {
      remote: z.string().optional().default("origin").describe("Remote name. Default 'origin'."),
      branch: z.string().optional().describe("Branch name. If not specified, pulls current branch."),
    },
  },
  async ({ remote, branch }) => {
    try {
      const result = branch
        ? await git.pull(remote, branch)
        : await git.pull(remote);
      
      return {
        content: [
          {
            type: "text",
            text: `Pulled from ${remote}${branch ? `/${branch}` : ''}\nFiles changed: ${result.files?.length || 0}`,
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error pulling: ${error.message}`,
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
