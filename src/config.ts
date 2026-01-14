/**
 * Configuration Management for Postgres Memory MCP Server
 * Handles secure storage and retrieval of Postgres credentials
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join, dirname } from 'path';

export interface PostgresConfig {
    connectionString: string;
}

/**
 * Get the configuration file path
 * Stored in user's home directory for security
 */
export function getConfigPath(): string {
    const configDir = join(homedir(), '.config', 'postgres-memory-mcp');
    return join(configDir, 'config.json');
}

/**
 * Load configuration from file
 * @returns Configuration object or null if not found
 */
export function loadConfig(): PostgresConfig | null {
    const configPath = getConfigPath();

    if (!existsSync(configPath)) {
        return null;
    }

    try {
        const content = readFileSync(configPath, 'utf-8');
        const config = JSON.parse(content) as PostgresConfig;

        if (!config.connectionString) {
            return null;
        }

        return config;
    } catch (error) {
        console.error('Error loading config:', error);
        return null;
    }
}

/**
 * Save configuration to file
 * @param config - Configuration to save
 */
export function saveConfig(config: PostgresConfig): void {
    const configPath = getConfigPath();
    const configDir = dirname(configPath);

    // Create directory if it doesn't exist
    if (!existsSync(configDir)) {
        mkdirSync(configDir, { recursive: true });
    }

    // Write config with restricted permissions concept (JSON format)
    writeFileSync(configPath, JSON.stringify(config, null, 2), { mode: 0o600 });
}

/**
 * Get configuration from environment variables
 * Environment variables take precedence over config file
 */
export function getConfigFromEnv(): Partial<PostgresConfig> {
    return {
        connectionString: process.env.POSTGRES_URL || process.env.DATABASE_URL,
    };
}

/**
 * Get merged configuration (env vars override file config)
 */
export function getConfig(): PostgresConfig | null {
    const fileConfig = loadConfig();
    const envConfig = getConfigFromEnv();

    // Environment variables take precedence
    const merged: Partial<PostgresConfig> = {
        ...fileConfig,
        ...Object.fromEntries(
            Object.entries(envConfig).filter(([_, v]) => v !== undefined)
        ),
    };

    // Check if we have all required fields
    if (!merged.connectionString) {
        return null;
    }

    return merged as PostgresConfig;
}



