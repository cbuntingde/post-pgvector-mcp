# Postgres Memory MCP Server

An MCP server that provides semantic memory storage using a local PostgreSQL database with the `pgvector` extension. This enables your AI assistant to store, retrieve, and search memories using vector embeddings.

## Features

- **Semantic Search**: Uses OpenAI-compatible embeddings (Xenova/all-MiniLM-L6-v2) to find relevant memories.
- **Local Postgres**: Runs entirely on your local machine using Docker or a local Postgres instance.
- **Memory Management**: Store, list, delete, and inspect memories.
- **Project Isolation**: Memories are scoped by `project_id`.

## Prerequisites

1.  **Docker Desktop**: Ensure Docker is installed and running.
2.  **Node.js**: Version 18 or higher.

## Installation

### 1. Start Postgres with pgvector

You can use the provided `docker-compose.yml` in the `../post-pgvector-docker` directory (or create one):

```yaml
services:
  db:
    image: pgvector/pgvector:pg16
    restart: always
    ports:
      - "5432:5432"
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
      POSTGRES_DB: postgres
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
```

Run it:
```bash
docker-compose up -d
```

### 2. Configure the MCP Server

```bash
npx postgres-pgvector-memory-mcp setup
```

This interactive setup will:
1.  Ask for your Postgres Connection String (default: `postgresql://postgres:password@localhost:5432/postgres`).
2.  Connect to the database.
3.  Automatically apply the database schema (create `memories` table and `vector` extension).

### 3. Add to your MCP Client

Add the following to your `mcp.json` or MCP settings:

```json
{
  "mcpServers": {
    "postgres-memory": {
      "command": "node",
      "args": [
        "c:/mcpservers/post-pgvector-mcp/dist/index.js"
      ],
      "env": {
        "POSTGRES_URL": "postgresql://postgres:password@localhost:5432/postgres"
      }
    }
  }
}
```

## Tools

- `store_memory`: Save a snippet of information with a category.
- `search_memories`: Find memories semantically related to a query.
- `list_memories`: recent memories for a project.
- `delete_memory`: Remove a memory by ID.
- `get_project_stats`: Count memories for a project.

## Development

1.  Install dependencies:
    ```bash
    npm install
    ```

2.  Build:
    ```bash
    npm run build
    ```

3.  Run locally:
    ```bash
    npm run dev
    ```

## License

MIT
