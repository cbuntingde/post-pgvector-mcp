#!/usr/bin/env node
/**
 * Postgres Memory MCP Server
 * Semantic memory storage using Postgres with pgvector
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import pg from "pg";
import { getEmbedding } from "./embedding.js";
import { getConfig } from "./config.js";
import { runSetup } from "./setup.js";

// Check for setup command
if (process.argv.includes('setup')) {
    await runSetup();
    process.exit(0);
}

// Initialize configuration
const config = getConfig();

if (!config) {
    console.error("❌ Configuration not found. Please run 'npx postgres-memory-mcp setup'");
    process.exit(1);
}

// Initialize Postgres Client
const pool = new pg.Pool({
    connectionString: config.connectionString,
    ssl: config.connectionString.includes('localhost') ? false : { rejectUnauthorized: false }
});

// Initialize MCP Server
const server = new McpServer({
    name: "postgres-memory",
    version: "1.0.0",
});


/**
 * Format embedding array for pgvector
 */
function formatEmbedding(embedding: number[]): string {
    return `[${embedding.join(",")}]`;
}

// ══════════════════════════════════════════════════════════════════════════════
// MCP TOOLS
// ══════════════════════════════════════════════════════════════════════════════

server.tool(
    "store_memory",
    {
        content: z.string().describe("The text content to remember"),
        category: z.string().describe("Category (e.g., 'tech_stack', 'decision', 'snippet')"),
        project_id: z.string().describe("Unique identifier for the project"),
        metadata: z.record(z.unknown()).optional().describe("Optional metadata"),
    },
    async ({ content, category, project_id, metadata }) => {
        try {
            const embedding = await getEmbedding(content);
            const embeddingStr = formatEmbedding(embedding);

            const query = `
                INSERT INTO memories (project_id, category, content, embedding, metadata)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING id;
            `;

            const { rows } = await pool.query(query, [
                project_id,
                category,
                content,
                embeddingStr,
                metadata || {}
            ]);

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            success: true,
                            message: `Memory stored successfully`,
                            memory_id: rows[0].id,
                            project_id,
                        }, null, 2),
                    },
                ],
            };
        } catch (error) {
            return {
                content: [{ type: "text", text: `Error: ${String(error)}` }],
                isError: true,
            };
        }
    }
);

server.tool(
    "search_memories",
    {
        query: z.string().describe("The semantic query to search for"),
        project_id: z.string().describe("Filter by project ID"),
        category: z.string().optional(),
        limit: z.number().min(1).max(50).optional().default(5),
        similarity_threshold: z.number().min(0).max(1).optional().default(0.5),
    },
    async ({ query, project_id, category, limit, similarity_threshold }) => {
        try {
            const queryEmbedding = await getEmbedding(query);
            const embeddingStr = formatEmbedding(queryEmbedding);

            let sql = `
                SELECT 
                    id, 
                    content, 
                    category, 
                    created_at,
                    1 - (embedding <=> $1) as similarity
                FROM memories
                WHERE project_id = $2
                AND 1 - (embedding <=> $1) > $3
            `;

            const params: any[] = [embeddingStr, project_id, similarity_threshold];

            if (category) {
                sql += ` AND category = $4`;
                params.push(category);
            }

            sql += ` ORDER BY embedding <=> $1 LIMIT $${params.length + 1}`;
            params.push(limit);

            const { rows } = await pool.query(sql, params);

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            success: true,
                            results: rows,
                        }, null, 2),
                    },
                ],
            };
        } catch (error) {
            return {
                content: [{ type: "text", text: `Error: ${String(error)}` }],
                isError: true,
            };
        }
    }
);

server.tool(
    "list_memories",
    {
        project_id: z.string(),
        category: z.string().optional(),
        limit: z.number().optional().default(20),
        offset: z.number().optional().default(0),
    },
    async ({ project_id, category, limit, offset }) => {
        try {
            let sql = `
                SELECT id, category, content, created_at 
                FROM memories 
                WHERE project_id = $1
            `;
            const params: any[] = [project_id];

            if (category) {
                sql += ` AND category = $2`;
                params.push(category);
            }

            // Order and pagination
            const pLimit = params.length + 1;
            const pOffset = params.length + 2;

            sql += ` ORDER BY created_at DESC LIMIT $${pLimit} OFFSET $${pOffset}`;
            params.push(limit, offset);

            const { rows } = await pool.query(sql, params);

            return { content: [{ type: "text", text: JSON.stringify(rows, null, 2) }] };
        } catch (error) {
            return { content: [{ type: "text", text: `Error: ${String(error)}` }], isError: true };
        }
    }
);

server.tool(
    "delete_memory",
    { memory_id: z.string(), project_id: z.string() },
    async ({ memory_id, project_id }) => {
        try {
            const { rowCount } = await pool.query(
                "DELETE FROM memories WHERE id = $1 AND project_id = $2",
                [memory_id, project_id]
            );

            if (rowCount === 0) {
                return { content: [{ type: "text", text: "Memory not found or access denied" }], isError: true };
            }

            return { content: [{ type: "text", text: "Memory deleted" }] };
        } catch (error) {
            return { content: [{ type: "text", text: `Error: ${String(error)}` }], isError: true };
        }
    }
);

server.tool(
    "get_project_stats",
    { project_id: z.string() },
    async ({ project_id }) => {
        try {
            const { rows } = await pool.query(
                "SELECT COUNT(*) as exact_count FROM memories WHERE project_id = $1",
                [project_id]
            );
            return { content: [{ type: "text", text: JSON.stringify({ total_memories: parseInt(rows[0].exact_count) }) }] };
        } catch (error) {
            return { content: [{ type: "text", text: `Error: ${String(error)}` }], isError: true };
        }
    }
);

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("🧠 Postgres Memory MCP Server started");
}

main().catch((error) => {
    console.error("Failed to start MCP server:", error);
    process.exit(1);
});

