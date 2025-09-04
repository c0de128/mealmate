# Database Setup Guide

This guide walks you through setting up PostgreSQL database for MealMate.

## Quick Setup with Neon (Recommended)

1. **Create a Neon Account** (Free PostgreSQL hosting)
   - Go to [neon.tech](https://neon.tech)
   - Sign up for a free account
   - Create a new project

2. **Get Database URL**
   - Copy the connection string from your Neon dashboard
   - It looks like: `postgresql://username:password@hostname/database?sslmode=require`

3. **Setup Environment**
   ```bash
   cp .env.example .env
   # Edit .env and add your DATABASE_URL and MISTRAL_API_KEY
   ```

4. **Initialize Database**
   ```bash
   npm run db:push
   ```

5. **Start Development**
   ```bash
   npm run dev
   ```

## Alternative: Local PostgreSQL

1. **Install PostgreSQL**
   - Windows: Download from postgresql.org
   - Mac: `brew install postgresql`
   - Linux: `sudo apt install postgresql`

2. **Create Database**
   ```bash
   createdb mealmate
   ```

3. **Set Environment Variables**
   ```env
   DATABASE_URL="postgresql://username:password@localhost:5432/mealmate"
   ```

4. **Initialize Database**
   ```bash
   npm run db:push
   ```

## Database Commands

- `npm run db:generate` - Generate migration files
- `npm run db:push` - Push schema changes to database  
- `npm run db:migrate` - Run migrations
- `npm run db:studio` - Open Drizzle Studio (database GUI)

## Required Environment Variables

```env
DATABASE_URL="your_postgresql_connection_string"
MISTRAL_API_KEY="your_mistral_api_key"
NODE_ENV="development"
PORT=5000
```

## Troubleshooting

**Connection Issues:**
- Ensure DATABASE_URL is correctly formatted
- Check firewall settings for local PostgreSQL
- Verify SSL settings for hosted databases

**Migration Issues:**
- Run `npm run db:generate` before `npm run db:push`
- Check database permissions
- Ensure database exists

**Sample Data:**
- Sample recipes are automatically added on first startup
- To reset data, delete all records and restart the server