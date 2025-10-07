# Workflow Studio SaaS

Workflow Studio is a secure SaaS prototype that lets operations teams design, document, and retain automation workflows. The app now ships with a Node.js/Express backend for authenticated access, subscription management, and an in-memory datastore for user history.

## What’s inside

- **Landing experience** that explains the product value proposition and highlights plan options.
- **Secure authentication** with bcrypt-hashed passwords, JWT-based sessions, and a memory database for user profiles, workflows, and activity history.
- **Workflow builder** that captures metadata, triggers, steps, documentation notes, and JSON exports.
- **Subscription tiers** (trial, Pro, Enterprise) powered by Stripe Checkout with Apple Pay enabled through Stripe’s card payment method.
- **Activity timeline** so teams can review workflow changes, subscription updates, and account events.

## Prerequisites

- Node.js 18+
- npm 9+
- Stripe account (optional, required for live checkout)

## Quick start

```bash
npm install
npm run start
```

The server listens on `http://localhost:3000` by default and serves both the API and single-page app.

### Environment variables

Create a `.env` file (or export environment variables before running) to configure secrets:

| Variable | Purpose |
| --- | --- |
| `PORT` | Optional HTTP port (defaults to `3000`). |
| `JWT_SECRET` | Secret used to sign authentication tokens. Set to a strong random value in production. |
| `STRIPE_SECRET_KEY` | Stripe secret API key. Required to create Checkout sessions. |
| `STRIPE_PRO_PRICE_ID` | Price ID for the Pro subscription in Stripe. |
| `STRIPE_ENTERPRISE_PRICE_ID` | Price ID for the Enterprise subscription in Stripe. |

> Apple Pay support is automatically available through Stripe when the domain is registered in the Stripe dashboard. No additional code changes are required.

### In-memory datastore

The application keeps user profiles, workflows, and history in memory. Restarting the server clears the dataset. This is ideal for demos and can be swapped for a persistent database in the future.

### Authentication flow

1. Visitors create an account from the landing page to start the limited free trial.
2. Passwords are hashed with `bcrypt` before being stored in memory.
3. Successful login returns a JWT that the front end stores in local storage and uses for subsequent API calls.
4. Every protected endpoint requires the `Authorization: Bearer <token>` header.

### Subscription management

- Trial accounts are restricted to two saved workflows and 10 steps per workflow.
- Upgrades call `/api/billing/create-checkout-session` to redirect to Stripe Checkout. Stripe surfaces Apple Pay on compatible devices.
- After Stripe redirects back with `?checkout=success`, the front end calls `/api/billing/activate` to mark the plan as active (a placeholder for production webhooks).

## API overview

| Endpoint | Method | Description |
| --- | --- | --- |
| `/api/health` | GET | Health check. |
| `/api/plans` | GET | Public plan metadata for pricing cards and upgrade UI. |
| `/api/auth/register` | POST | Create a new user and start the free trial. |
| `/api/auth/login` | POST | Authenticate an existing account. |
| `/api/auth/me` | GET | Fetch the authenticated user profile. |
| `/api/auth/history` | GET | Retrieve user-level activity history. |
| `/api/workflows` | GET/POST | List or upsert workflows for the authenticated user. |
| `/api/workflows/:id` | DELETE | Remove a workflow. |
| `/api/billing/create-checkout-session` | POST | Create a Stripe Checkout session for upgrades. |
| `/api/billing/activate` | POST | Mark a subscription as active (used after successful Checkout redirect). |

## Development notes

- The UI is a single-page application (`app/index.html`) that consumes the REST API directly and stores JWTs in `localStorage`.
- Styling lives in `app/styles.css` and uses CSS custom properties for dark-mode theming.
- Workflow templates and UI logic are handled in `app/app.js` using vanilla JavaScript.
- Because the datastore is in memory, running automated tests that expect persistence will need to bootstrap users and data on each run.

## Future enhancements

- Swap the in-memory datastore for PostgreSQL or MongoDB.
- Add role-based access control and audit exports.
- Implement Stripe webhooks to automatically activate/cancel subscriptions.
- Add collaborative editing and real-time presence in the builder.
