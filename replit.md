# MealPlan Application

## Overview

MealPlan is a comprehensive meal planning and recipe management web application built with React and Express. The application enables users to manage recipes, create weekly meal plans, and generate automated shopping lists. It features a modern interface with drag-and-drop meal planning functionality, recipe search and filtering, and cost estimation for grocery shopping.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

The frontend is built using React with TypeScript and follows a component-based architecture:

**Core Technologies:**
- React 18 with functional components and hooks
- TypeScript for type safety
- Vite as the build tool and development server
- Wouter for client-side routing
- TanStack Query for server state management
- React Hook Form with Zod validation for form handling

**UI Framework:**
- Shadcn/UI components built on Radix UI primitives
- Tailwind CSS for styling with custom design tokens
- Responsive design with mobile-first approach

**State Management:**
- TanStack Query for server state caching and synchronization
- Local React state for component-specific data
- Custom hooks for shared logic (drag-drop, meal planning, mobile detection)

**Key Features:**
- Drag-and-drop meal planning interface
- Real-time search and filtering
- Toast notifications for user feedback
- Responsive navigation with mobile support

### Backend Architecture

The backend follows a RESTful API design using Express.js:

**Core Technologies:**
- Express.js with TypeScript
- Modular route handling
- In-memory storage implementation (with interface for future database integration)
- Zod schema validation for request/response data

**API Design:**
- RESTful endpoints for recipes, meal plans, and shopping lists
- Consistent error handling and response formatting
- Request logging middleware for debugging
- CORS and security middleware

**Data Layer:**
- Abstract storage interface (IStorage) for flexibility
- Current implementation uses in-memory storage with sample data
- Drizzle ORM configuration ready for PostgreSQL integration
- Schema definitions shared between frontend and backend

### Data Storage Solutions

**Current Implementation:**
- In-memory storage for development and testing
- Sample data initialization for immediate functionality

**Database Schema (Drizzle ORM):**
- PostgreSQL as the target database
- Three main entities: recipes, meal_plans, shopping_list_items
- JSON columns for complex data (ingredients, dietary tags)
- Proper foreign key relationships and cascading deletes

**Data Models:**
- Recipe: name, description, prep/cook times, difficulty, servings, ingredients, instructions, dietary tags
- MealPlan: date, meal type, recipe reference, servings
- ShoppingListItem: week reference, ingredient details, quantity, estimated cost, completion status

### Authentication and Authorization

Currently, the application does not implement authentication or authorization mechanisms. All API endpoints are publicly accessible, making it suitable for single-user or demo environments.

### External Dependencies

**Frontend Dependencies:**
- Radix UI components for accessible primitives
- Lucide React for consistent iconography
- Date-fns for date manipulation and formatting
- Class Variance Authority for component variant management
- Embla Carousel for potential carousel functionality

**Backend Dependencies:**
- Drizzle ORM for database operations
- Neon Database serverless driver for PostgreSQL
- Connect-pg-simple for session storage (configured but not actively used)
- ESBuild for production bundling

**Development Tools:**
- Replit-specific plugins for development environment
- TypeScript for type checking across the entire stack
- PostCSS with Autoprefixer for CSS processing
- Custom Vite configuration for development server

**Database Integration:**
- Neon Database as the PostgreSQL provider
- Environment-based database URL configuration
- Migration support through Drizzle Kit
- Connection pooling and serverless compatibility