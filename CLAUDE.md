# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MealMate is a full-stack web application for meal planning, recipe management, and shopping list generation. Built as a monorepo with Express.js backend and React frontend using Vite.

## Architecture

- **Frontend**: React + TypeScript with Vite, Radix UI components, Tailwind CSS
- **Backend**: Express.js with TypeScript, runs directly with tsx (no build for dev)
- **Database**: PostgreSQL with Drizzle ORM (Neon for serverless deployment)
- **State Management**: React Query (TanStack Query) for server state
- **Routing**: Wouter (client), Express (server)
- **AI Integration**: Mistral API for recipe text parsing, URL recipe scraping
- **Schema Validation**: Zod with Drizzle-Zod integration
- **Testing**: Jest with ts-jest for unit and integration tests

## Key Commands

```bash
# Development - runs tsx directly, no build needed
npm run dev          # Starts development server on port 5000

# Type checking
npm run check        # TypeScript type checking

# Testing
npm test            # Run all tests
npm run test:watch  # Run tests in watch mode
npm run test:coverage # Generate coverage report
npm run test:unit   # Run unit tests only
npm run test:integration # Run integration tests only

# Production build
npm run build        # Builds both client (Vite) and server (esbuild)
npm start           # Runs production build

# Database operations
npm run db:generate  # Generate migration files from schema changes
npm run db:push     # Push schema directly to database (dev)
npm run db:migrate  # Run migrations (production)
npm run db:studio   # Open Drizzle Studio GUI
npm run db:init     # Initialize database with schema and sample data
```

## Core Architecture Patterns

### Database Layer
- **Schema**: `shared/schema.ts` defines all tables using Drizzle ORM
- **Connection**: `server/db.ts` uses Neon serverless PostgreSQL driver
- **Storage Layer**: `server/storage.ts` provides data access methods
- **Dev Storage**: `server/dev-storage.ts` handles in-memory fallback for development
- **Backup System**: `server/backup-system.ts` and `server/backup-api.ts` handle data backups

### API Structure
- **Main Server**: `server/index.ts` initializes Express app
- **App Configuration**: `server/app.ts` configures middleware and routes
- **Routes**: `server/routes.ts` registers all Express endpoints
- **Recipe Parser**: `server/recipe-parser.ts` uses Mistral AI for text parsing
- **URL Parser**: `server/url-recipe-parser.ts` scrapes recipes from URLs
- **Nutrition**: `server/nutrition.ts` calculates nutritional information
- **Collections**: Support for organizing recipes into custom collections
- **Bulk Operations**: `server/bulk-operations.ts` handles batch operations
- **Recipe Sharing**: `server/recipe-sharing.ts` manages recipe sharing functionality
- **Error Handling**: `server/error-handler.ts` centralized error management
- **Logging**: `server/logger.ts` and `server/logging-middleware.ts` for structured logging
- **Caching**: `server/cache-middleware.ts` for response caching
- **Health/Monitoring**: `server/health.ts` and `server/monitoring.ts` for system health

### Frontend Architecture
- **Components**: 
  - UI components in `client/src/components/ui/` (Radix UI based)
  - Business components in `client/src/components/` (recipe-card, meal-slot, etc.)
  - Bulk operations: `client/src/components/bulk-operations.tsx`
  - Recipe sharing: `client/src/components/recipe-share.tsx`
- **Pages**: Route components in `client/src/pages/`
  - `dashboard.tsx` - Main meal planning interface
  - `recipes.tsx` - Recipe management
  - `shopping.tsx` - Shopping list generation
  - `shared-recipe.tsx` - Public recipe viewing
- **Hooks**: Custom hooks in `client/src/hooks/`
  - `use-meal-plan.tsx` - Meal planning logic
  - `use-drag-drop.tsx` - Drag and drop functionality
  - `use-mobile.tsx` - Mobile detection
  - `use-toast.ts` - Toast notifications
- **API Client**: Uses React Query with fetch for data synchronization
- **Form Handling**: React Hook Form with Zod validation
- **PDF Export**: `client/src/lib/pdf-export.ts` for exporting recipes

### Path Aliases
- `@/`: Maps to `client/src/`
- `@shared/`: Maps to `shared/`
- `@server/`: Maps to `server/`
- `@client/`: Maps to `client/src/`
- `@assets/`: Maps to `attached_assets/`

## Database Schema

Key tables (all with PostgreSQL indexes for performance):
- `recipes`: Core recipe data with JSONB ingredients field
- `recipe_collections`: Custom recipe groupings
- `recipe_collection_items`: Many-to-many relationship
- `meal_plans`: Weekly meal scheduling
- `shopping_list_items`: Generated from meal plans

## API Endpoints

### Recipes
- `GET /api/recipes` - Search with query params (search, category, tags, favorites)
- `POST /api/recipes/parse` - AI-powered text parsing
- `POST /api/recipes/parse-url` - Scrape recipe from URL
- `GET/POST/PUT/DELETE /api/recipes/:id` - CRUD operations
- `PUT /api/recipes/:id/favorite` - Toggle favorite status
- `PUT /api/recipes/:id/rate` - Update rating
- `POST /api/recipes/bulk/delete` - Batch delete recipes
- `POST /api/recipes/bulk/collection` - Add multiple recipes to collection
- `GET /api/recipes/:id/share` - Get shareable recipe link
- `GET /api/shared/:shareId` - Get shared recipe data

### Collections
- `GET/POST /api/collections` - List and create collections
- `POST /api/collections/:id/recipes` - Add recipe to collection
- `DELETE /api/collections/:id/recipes/:recipeId` - Remove from collection

### Meal Planning
- `GET /api/meal-plans?startDate=&endDate=` - Get plans for date range
- `POST /api/meal-plans` - Create meal plan entry
- `DELETE /api/meal-plans/:id` - Remove meal plan

### Shopping List
- `GET /api/shopping-list?weekStartDate=` - Generate list for week
- `PUT /api/shopping-list/:id/check` - Toggle item checked state

### Backup & Health
- `POST /api/backup/export` - Export all data
- `POST /api/backup/import` - Import backup data
- `GET /api/health` - System health check
- `GET /api/health/metrics` - System metrics

## Environment Configuration

Required environment variables:
```env
DATABASE_URL=postgresql://...  # PostgreSQL connection string
MISTRAL_API_KEY=...            # For AI recipe parsing
PORT=5000                      # Server port (optional)
NODE_ENV=development           # Environment mode
```

## Development Workflow

1. Database changes: Modify `shared/schema.ts`, then run `npm run db:push`
2. API changes: Update `server/routes.ts` and `server/storage.ts`
3. UI changes: Components in `client/src/components/`, pages in `client/src/pages/`
4. Hot reload: Development server automatically reloads on changes

## Important Notes

- Production build uses esbuild for server bundling with ESM output
- Vite proxy configuration handles `/api` routes in development
- Database migrations tracked in `migrations/` directory
- Sample recipes automatically seeded on first startup if database is empty
- All timestamps stored in UTC, dates in YYYY-MM-DD format
- Session management with express-session and PostgreSQL store
- Response caching implemented for performance
- Structured logging with Winston for production
- Tests use Jest with ts-jest for TypeScript support
- Test files should match patterns: `*.test.ts`, `*.spec.ts`, or be in `__tests__/` directory