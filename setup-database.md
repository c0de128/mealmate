# PostgreSQL Setup for MealMate

## Installation Steps (Windows)

1. **Download PostgreSQL:**
   - Visit: https://www.postgresql.org/download/windows/
   - Download PostgreSQL 16.x installer
   - Run as Administrator

2. **Installation Settings:**
   - Port: `5432` (default)
   - Superuser password: Choose a strong password
   - Install pgAdmin 4 (recommended)
   - Default locale settings

3. **Verify Installation:**
   ```bash
   psql --version
   ```

## Database Creation

After PostgreSQL is installed, run these commands:

```bash
# Connect to PostgreSQL (will prompt for password)
psql -U postgres

# Create the database
CREATE DATABASE mealmate;

# Connect to the new database
\c mealmate

# Verify connection
\dt
```

## Environment Configuration

Your `.env` file should have:
```env
DATABASE_URL="postgresql://postgres:your_password@localhost:5432/mealmate"
```

Replace `your_password` with the password you set during installation.

## Initialize Schema

Once database is created, run:
```bash
npm run db:push
```

This will create all tables from your schema automatically.

## Troubleshooting

- **Connection refused**: Make sure PostgreSQL service is running
- **Authentication failed**: Check username/password in DATABASE_URL
- **Database doesn't exist**: Run `CREATE DATABASE mealmate;` in psql
- **Permission denied**: Make sure user has database creation privileges