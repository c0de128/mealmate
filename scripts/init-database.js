#!/usr/bin/env node

/**
 * Database initialization script for MealMate
 * This script will:
 * 1. Create the database if it doesn't exist
 * 2. Push the schema to create all tables
 * 3. Initialize with sample data
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import dotenv from 'dotenv';

const execAsync = promisify(exec);

// Load environment variables
dotenv.config();

async function runCommand(command, description) {
  console.log(`🔄 ${description}...`);
  try {
    const { stdout, stderr } = await execAsync(command);
    if (stdout) console.log(stdout);
    if (stderr) console.warn(stderr);
    console.log(`✅ ${description} completed successfully`);
    return true;
  } catch (error) {
    console.error(`❌ ${description} failed:`, error.message);
    return false;
  }
}

async function testDatabaseConnection() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('❌ DATABASE_URL not configured in .env file');
    return false;
  }

  // Extract connection details
  const match = dbUrl.match(/postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/);
  if (!match) {
    console.error('❌ Invalid DATABASE_URL format');
    return false;
  }

  const [, username, password, host, port, database] = match;
  console.log(`🔍 Testing connection to PostgreSQL...`);
  console.log(`   Host: ${host}:${port}`);
  console.log(`   Database: ${database}`);
  console.log(`   User: ${username}`);

  // Test basic connection
  const testCmd = `psql "${dbUrl}" -c "SELECT version();"`;
  return await runCommand(testCmd, 'Database connection test');
}

async function pushSchema() {
  console.log('📋 Pushing database schema...');
  return await runCommand('npm run db:push', 'Schema push');
}

async function initializeDatabase() {
  console.log('🚀 Initializing MealMate Database\n');

  // Step 1: Test database connection
  const connectionOk = await testDatabaseConnection();
  if (!connectionOk) {
    console.log('\n📖 Please ensure PostgreSQL is installed and running');
    console.log('   1. Install PostgreSQL from: https://www.postgresql.org/download/');
    console.log('   2. Create database: CREATE DATABASE mealmate;');
    console.log('   3. Update DATABASE_URL in .env with correct credentials');
    process.exit(1);
  }

  // Step 2: Push schema
  const schemaPushed = await pushSchema();
  if (!schemaPushed) {
    console.log('\n❌ Schema push failed. Check your database configuration.');
    process.exit(1);
  }

  console.log('\n🎉 Database initialization completed successfully!');
  console.log('\nTo switch to PostgreSQL storage:');
  console.log('   1. Set USE_DATABASE=true in your .env file');
  console.log('   2. Restart your application');
  console.log('\nTo manage your database:');
  console.log('   - Use pgAdmin or any PostgreSQL client');
  console.log('   - Run npm run db:studio for Drizzle Studio');
}

// Run initialization
initializeDatabase().catch(console.error);