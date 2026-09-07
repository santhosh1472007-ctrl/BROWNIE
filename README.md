# Mini's Fudgy Brownies

A small monolithic brownie ordering system that preserves the existing customer website and adds a PostgreSQL-backed order API plus protected owner dashboard.

## Architecture

```text
Customer
   |
Frontend (index.html)
   |
Express API (/api/orders)
   |
Prisma ORM
   |
PostgreSQL
   |
Admin Dashboard (/admin)
```

## Requirements

- Node.js 20+
- PostgreSQL 14+
- npm

## Setup

1. Install dependencies:

```powershell
npm install
```

2. Create a PostgreSQL database named `brownies`.

3. Copy `.env.example` to `.env` and set real values. Never commit `.env`.

```powershell
Copy-Item .env.example .env
```

Required values:

- `DATABASE_URL`
- `JWT_SECRET`
- `FRONTEND_URL`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD` (used by the seed/create-admin command)

4. Generate Prisma client and apply the development migration:

```powershell
npm run db:generate
npm run db:migrate -- --name init
npm run db:seed
```

The seed creates the five existing brownie products and an admin account. For a real deployment, set a strong `ADMIN_PASSWORD` before seeding.

## Development

Run the complete website and API from the project root:

```powershell
npm run dev
```

Open:

- Customer website: `http://localhost:3000`
- Admin login: `http://localhost:3000/admin/login`

Build and run production JavaScript:

```powershell
npm run build
npm start
```

For deployment migrations use:

```powershell
npm run db:deploy
```

## Order flow

The customer checkout sends `customerName`, `customerPhone`, `customerAddress`, product IDs, quantities, and an `Idempotency-Key` to `POST /api/orders`. The server looks up products in PostgreSQL, rejects unavailable or unknown products, calculates all prices and totals, and creates the order and order items inside one transaction. Product name and price snapshots are stored on each order item.

A successful API response is the only event that lets the frontend show Order Confirmed. Failed requests keep the cart and form data intact.

## Admin

The owner signs in at `/admin/login`. Passwords are bcrypt-hashed. The dashboard uses an 8-hour JWT stored in session storage and calls protected endpoints:

- `GET /api/admin/orders`
- `GET /api/admin/orders/:id`
- `PATCH /api/admin/orders/:id/status`

Order statuses are `NEW`, `CONFIRMED`, `PREPARING`, `OUT_FOR_DELIVERY`, `DELIVERED`, and `CANCELLED`. Status is persisted in PostgreSQL.

## Testing

Run the test command with:

```powershell
npm test
```

Manual critical flow:

1. Start PostgreSQL and the development server.
2. Seed products and an admin.
3. Add Classic Fudge Square and Walnut Crunch.
4. Submit checkout details.
5. Confirm the browser waits for the API before showing confirmation.
6. Sign in at `/admin` and verify the order and `NEW` status.
7. Change status to `CONFIRMED`, refresh, and verify it remains `CONFIRMED`.
8. Stop the API, retry checkout, and verify the cart remains saved with an error.

## Production considerations

This is development-ready application code, not a fully deployment-ready launch. Before a real business launch, configure managed PostgreSQL backups, HTTPS/TLS, a strong secret manager, restrictive production CORS, reverse-proxy rate limits, monitoring, log redaction, migrations in CI/CD, admin account recovery, and a deployment platform. No payment gateway or delivery pricing is included.
