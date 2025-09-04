# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MealMate is a full-stack web application for meal planning, recipe management, and shopping list generation. It's built as a monorepo with Express.js backend and React frontend, using Vite for development and bundling.

## Architecture

- **Monorepo structure**: Client and server code in separate directories
- **Frontend**: React + TypeScript with Vite, using Radix UI components and Tailwind CSS
- **Backend**: Express.js with TypeScript, in-memory storage (MemStorage class)
- **Shared**: Common schema definitions and types in `shared/` directory
- **Routing**: Client uses Wouter for routing, server uses Express
- **State Management**: React Query (TanStack Query) for server state
- **AI Integration**: Mistral API for recipe parsing functionality

## Key Commands

```bash
# Development (runs both client and server)
npm run dev

# Type checking
npm run check

# Build for production
npm run build

# Start production server
npm start

# Database operations
npm run db:push
```

## Directory Structure

```
├── client/           # React frontend
│   ├── src/
│   │   ├── components/  # React components including UI library
│   │   ├── pages/      # Route components (dashboard, recipes, shopping)
│   │   ├── hooks/      # Custom React hooks
│   │   └── lib/        # Utilities and query client
├── server/           # Express.js backend
│   ├── index.ts      # Main server entry point
│   ├── routes.ts     # API route definitions
│   ├── storage.ts    # In-memory data storage layer
│   └── recipe-parser.ts # AI-powered recipe parsing
├── shared/          # Shared TypeScript schemas and types
└── vite.config.ts   # Vite configuration
```

## API Endpoints

- **Recipes**: `/api/recipes` (CRUD operations)
- **Recipe parsing**: `/api/recipes/parse` (AI-powered text parsing)
- **Meal plans**: `/api/meal-plans` (weekly meal planning)
- **Shopping lists**: `/api/shopping-list` (generate from meal plans)

## Development Notes

- Uses in-memory storage (MemStorage) - data resets on server restart
- Recipe parsing requires MISTRAL_API_KEY environment variable
- Server runs on port 5000 (configurable via PORT env var)
- Client proxy configured in Vite for API requests
- Shared schema validation using Zod
- Component library based on Radix UI with Tailwind styling
- Drag-and-drop functionality for meal planning
- Real-time shopping list generation from planned meals

## Testing

No test framework is currently configured. Check package.json scripts for any test commands before running tests.