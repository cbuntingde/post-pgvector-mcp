-- ═══════════════════════════════════════════════════════════════════════════════
-- Supabase Memory MCP Server - Database Schema
-- Run this SQL in your Supabase SQL Editor (https://app.supabase.com)
-- ═══════════════════════════════════════════════════════════════════════════════

-- Enable pgvector extension (required for semantic search)
CREATE EXTENSION IF NOT EXISTS vector;

-- ═══════════════════════════════════════════════════════════════════════════════
-- MEMORIES TABLE
-- Stores all memory entries with vector embeddings
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS memories (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    project_id TEXT NOT NULL,
    category TEXT,
    content TEXT NOT NULL,
    embedding vector(384),  -- Xenova/all-MiniLM-L6-v2 dimension
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add comment for documentation
COMMENT ON TABLE memories IS 'Semantic memory storage for MCP server with vector embeddings';
COMMENT ON COLUMN memories.embedding IS 'Xenova/all-MiniLM-L6-v2 384-dimension vector';
COMMENT ON COLUMN memories.project_id IS 'Unique project identifier for memory isolation';

-- ═══════════════════════════════════════════════════════════════════════════════
-- INDEXES
-- Optimized for common query patterns
-- ═══════════════════════════════════════════════════════════════════════════════

-- B-tree indexes for filtering
CREATE INDEX IF NOT EXISTS idx_memories_project_id ON memories(project_id);
CREATE INDEX IF NOT EXISTS idx_memories_category ON memories(category);
CREATE INDEX IF NOT EXISTS idx_memories_created_at ON memories(created_at DESC);

-- Composite index for common queries
CREATE INDEX IF NOT EXISTS idx_memories_project_category ON memories(project_id, category);

-- HNSW index for fast semantic vector search
-- This provides approximate nearest neighbor search with excellent performance
CREATE INDEX IF NOT EXISTS idx_memories_embedding ON memories 
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- ═══════════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════════════════════════

-- RLS is disabled by default for local Postgres setup to ensure compatibility.
-- If you need RLS, ensure the 'authenticated' and 'service_role' roles exist.
-- ALTER TABLE memories ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════════════════════════════════════════
-- SEMANTIC SEARCH FUNCTION
-- This function enables fast vector similarity search
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION match_memories(
    query_embedding vector(384),
    match_project_id TEXT,
    match_category TEXT DEFAULT NULL,
    match_threshold FLOAT DEFAULT 0.5,
    match_count INT DEFAULT 5
)
    RETURNS TABLE (
    id UUID,
    project_id TEXT,
    category TEXT,
    content TEXT,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE,
    similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        m.id,
        m.project_id,
        m.category,
        m.content,
        m.metadata,
        m.created_at,
        m.updated_at,
        1 - (m.embedding <=> query_embedding) AS similarity
    FROM memories m
    WHERE m.project_id = match_project_id
      AND (match_category IS NULL OR m.category = match_category)
      AND 1 - (m.embedding <=> query_embedding) >= match_threshold
    ORDER BY m.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

COMMENT ON FUNCTION match_memories IS 'Semantic similarity search using cosine distance';

-- ═══════════════════════════════════════════════════════════════════════════════
-- UPDATED_AT TRIGGER
-- Automatically updates the updated_at timestamp on row changes
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_memories_updated_at ON memories;
CREATE TRIGGER update_memories_updated_at
    BEFORE UPDATE ON memories
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ═══════════════════════════════════════════════════════════════════════════════
-- CLEANUP FUNCTION (Optional)
-- Removes old memories to manage storage
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION cleanup_old_memories(
    older_than_days INT DEFAULT 90,
    target_project_id TEXT DEFAULT NULL
)
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
    deleted_count INT;
BEGIN
    WITH deleted AS (
        DELETE FROM memories
        WHERE created_at < NOW() - (older_than_days || ' days')::INTERVAL
          AND (target_project_id IS NULL OR project_id = target_project_id)
        RETURNING *
    )
    SELECT COUNT(*) INTO deleted_count FROM deleted;
    
    RETURN deleted_count;
END;
$$;

COMMENT ON FUNCTION cleanup_old_memories IS 'Removes memories older than specified days';

-- ═══════════════════════════════════════════════════════════════════════════════
-- VERIFICATION QUERY
-- Run this to verify the setup is complete
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
    RAISE NOTICE '✅ Schema creation complete!';
    RAISE NOTICE '   - Table: memories';
    RAISE NOTICE '   - Function: match_memories (semantic search)';
    RAISE NOTICE '   - Function: cleanup_old_memories';
    RAISE NOTICE '   - Trigger: update_memories_updated_at';
    RAISE NOTICE '   - Indexes: HNSW for vectors, B-tree for filters';
END $$;