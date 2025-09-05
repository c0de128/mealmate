# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MealMate is a full-stack web application for meal planning, recipe management, and shopping list generation. Built as a monorepo with Express.js backend and React frontend using Vite.

## Architecture

- **Frontend**: React + TypeScript with Vite, Radix UI components, Tailwind CSS
- **Backend**: Express.js with TypeScript
- **Database**: PostgreSQL with Drizzle ORM (Neon for serverless deployment)
- **State Management**: React Query (TanStack Query) for server state
- **Routing**: Wouter (client), Express (server)
- **AI Integration**: Mistral API for recipe parsing
- **Schema Validation**: Zod with Drizzle-Zod integration

## Key Commands

```bash
# Development - runs tsx directly, no build needed
npm run dev

# Type checking
npm run check

# Production build
npm run build        # Builds both client (Vite) and server (esbuild)
npm start           # Runs production build

# Database operations
npm run db:generate  # Generate migration files from schema changes
npm run db:push     # Push schema directly to database (dev)
npm run db:migrate  # Run migrations (production)
npm run db:studio   # Open Drizzle Studio GUI
```

## Core Architecture Patterns

### Database Layer
- **Schema**: `shared/schema.ts` defines all tables using Drizzle ORM
- **Connection**: `server/db.ts` uses Neon serverless PostgreSQL driver
- **Storage Layer**: `server/storage.ts` provides data access methods
- **Dev Storage**: `server/dev-storage.ts` handles in-memory fallback for development

### API Structure
- **Routes**: `server/routes.ts` registers all Express endpoints
- **Recipe Parser**: `server/recipe-parser.ts` uses Mistral AI for text parsing
- **Nutrition**: `server/nutrition.ts` calculates nutritional information
- **Collections**: Support for organizing recipes into custom collections

### Frontend Architecture
- **Components**: Located in `client/src/components/ui/` (Radix UI based)
- **Pages**: Route components in `client/src/pages/` (dashboard, recipes, shopping)
- **API Client**: Uses React Query with fetch for data synchronization
- **Form Handling**: React Hook Form with Zod validation

### Path Aliases
- `@/`: Maps to `client/src/`
- `@shared/`: Maps to `shared/`
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
- `GET /api/recipes` - Search with query params
- `POST /api/recipes/parse` - AI-powered text parsing
- `GET/POST/PUT/DELETE /api/recipes/:id` - CRUD operations
- `PUT /api/recipes/:id/favorite` - Toggle favorite status
- `PUT /api/recipes/:id/rate` - Update rating

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