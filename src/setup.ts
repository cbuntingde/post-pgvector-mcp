#!/usr/bin/env node
/**
 * Interactive Setup for Postgres Memory MCP Server
 * Guides users through configuration with validation and automatic DB setup
 */

import inquirer from 'inquirer';
import chalk from 'chalk';
import {
    saveConfig,
    loadConfig,
    getConfigPath,
    type PostgresConfig
} from './config.js';
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BANNER = `
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   ${chalk.cyan.bold('🧠 Postgres Memory MCP Server')}                              ║
║   ${chalk.gray('Semantic memory storage with pgvector')}                        ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
`;

async function runMigrations(connectionString: string): Promise<boolean> {
    console.log(chalk.yellow('\n⏳ Connecting to database to apply schema...'));

    const client = new pg.Client({
        connectionString,
        ssl: connectionString.includes('localhost') ? false : { rejectUnauthorized: false }
    });

    try {
        await client.connect();

        // Locate schema.sql
        const possiblePaths = [
            path.join(process.cwd(), 'schema.sql'),
            path.join(__dirname, '..', 'schema.sql'),
            path.join(__dirname, '../..', 'schema.sql')
        ];

        let schemaPath = possiblePaths.find(p => fs.existsSync(p));

        if (!schemaPath) {
            console.log(chalk.red('❌ Could not find schema.sql file.'));
            return false;
        }

        const sql = fs.readFileSync(schemaPath, 'utf8');

        console.log(chalk.gray(`   Reading schema from ${schemaPath}`));
        await client.query(sql);

        console.log(chalk.green('✅ Database schema applied successfully!'));

        return true;
    } catch (error) {
        console.log(chalk.red(`❌ Failed to apply database schema: ${error}`));
        return false;
    } finally {
        await client.end().catch(() => { });
    }
}

async function testConnection(config: PostgresConfig): Promise<boolean> {
    console.log(chalk.yellow('\n⏳ Testing Database connection...'));

    const client = new pg.Client({
        connectionString: config.connectionString,
        ssl: config.connectionString.includes('localhost') ? false : { rejectUnauthorized: false }
    });

    try {
        await client.connect();
        const { rows } = await client.query("SELECT count(*) FROM information_schema.tables WHERE table_name = 'memories'");

        if (rows[0].count === '0') {
            console.log(chalk.yellow('⚠️  Database Connected, but tables missing.'));
            return true;
        }

        console.log(chalk.green('✅ Database Connection successful!'));
        await client.end();
        return true;
    } catch (error) {
        console.log(chalk.red(`❌ Connection failed: ${error}`));
        await client.end().catch(() => { });
        return false;
    }
}

export async function runSetup() {
    console.log(BANNER);

    const existingConfig = loadConfig();

    if (existingConfig) {
        console.log(chalk.green('✓ Existing configuration found at:'));
        console.log(chalk.gray(`  ${getConfigPath()}\n`));

        const { reconfigure } = await inquirer.prompt([{
            type: 'confirm',
            name: 'reconfigure',
            message: 'Would you like to reconfigure?',
            default: false
        }]);

        if (!reconfigure) process.exit(0);
    }

    console.log(chalk.cyan('Step 1: Postgres Configuration\n'));

    const answers = await inquirer.prompt([
        {
            type: 'input',
            name: 'connectionString',
            message: 'Postgres Connection String (postgresql://user:pass@host:5432/db):',
            default: existingConfig?.connectionString || 'postgresql://postgres:password@localhost:5432/postgres',
            validate: (input) => input.trim().startsWith('postgres') ? true : 'Invalid connection string'
        }
    ]);

    // DB Setup
    let dbSetup = false;

    console.log(chalk.cyan('\nStep 2: Database Setup'));
    const { shouldSetupDb } = await inquirer.prompt([{
        type: 'confirm',
        name: 'shouldSetupDb',
        message: 'Run automatic database migration (create tables & extension)?',
        default: true
    }]);

    if (shouldSetupDb) {
        dbSetup = await runMigrations(answers.connectionString);
    }

    const config: PostgresConfig = {
        connectionString: answers.connectionString.trim()
    };

    await testConnection(config);
    saveConfig(config);

    console.log(chalk.green(`\n✓ Configuration saved to: ${getConfigPath()}`));
    if (dbSetup) {
        console.log(chalk.green.bold('\n🚀 Setup complete! Server is ready.'));
    } else {
        console.log(chalk.yellow('\n⚠️  Database schema not applied automatically. Run schema.sql manually.'));
    }
}

if (import.meta.url === `file://${process.argv[1]}`) {
    runSetup().catch((error) => {
        console.error(chalk.red('Setup failed:'), error);
        process.exit(1);
    });
}

