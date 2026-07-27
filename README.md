<div align="center">

# NexWare

**Smart Warehouse Management System**

A full-stack platform for warehouse order picking and real-time market price management — built for warehouse staff and administrators.

[![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688?style=flat-square&logo=fastapi)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/Frontend-React%2018-61DAFB?style=flat-square&logo=react)](https://react.dev/)
[![Expo](https://img.shields.io/badge/Mobile-Expo%20%2F%20React%20Native-000020?style=flat-square&logo=expo)](https://expo.dev/)
[![Supabase](https://img.shields.io/badge/Database-Supabase%20PostgreSQL-3ECF8E?style=flat-square&logo=supabase)](https://supabase.com/)
[![Vercel](https://img.shields.io/badge/Deployed%20on-Vercel-000000?style=flat-square&logo=vercel)](https://vercel.com/)

</div>

---

## What It Does

NexWare has three parts working together:

- **Web Admin Panel** — Admins manage products, orders, users, and supplier market prices
- **FastAPI Backend** — REST API handling authentication, orders, pick lists, and push notifications
- **Mobile App (Expo)** — Warehouse pickers receive orders and complete pick lists on their phones

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.11, FastAPI, SQLAlchemy (async), Alembic |
| Database | Supabase (PostgreSQL) |
| Frontend | React 18, Vite, TypeScript, Tailwind CSS |
| Mobile | React Native, Expo SDK |
| Auth | JWT (HS256), bcrypt |
| Hosting | Vercel (frontend + backend serverless) |
| Notifications | Expo Push Notification Service |

---

## Quick Setup

### Prerequisites

- Python ≥ 3.11
- Node.js ≥ 20 LTS
- A [Supabase](https://supabase.com/) project (free tier works)

---

### 1 — Backend

```bash
git clone https://github.com/Vaidik26/Nexware.git
cd Nexware/backend

# Create and activate virtual environment
python -m venv .venv
.venv\Scripts\activate        # Windows
# source .venv/bin/activate   # macOS / Linux

# Install dependencies
pip install -r requirements.txt

# Set up environment variables (see section below)
cp .env.example .env
# Edit .env with your values

# Seed the database (creates tables + default admin account)
python seed.py

# Run the server
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

API live at → `http://localhost:8000`  
Swagger docs → `http://localhost:8000/docs`

---

### 2 — Frontend

```bash
cd frontend

npm install

# Set up environment variables
cp .env.example .env.local
# Edit .env.local with your values

npm run dev
```

Web app live at → `http://localhost:5173`

---

### 3 — Mobile App

```bash
cd mobile

npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your values

npx expo start
```

Scan the QR code with the **Expo Go** app on your phone.

---

## Environment Variables

### Backend — `backend/.env`

| Variable | Description |
|---|---|
| `DATABASE_URL` | Supabase PostgreSQL async connection string |
| `JWT_SECRET_KEY` | Any long random string used to sign tokens |
| `ALGORITHM` | JWT algorithm — set to `HS256` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | How long access tokens last (e.g. `1440`) |
| `REFRESH_TOKEN_EXPIRE_DAYS` | How long refresh tokens last (e.g. `7`) |
| `ALLOWED_ORIGINS` | Comma-separated list of allowed frontend URLs |
| `EXPO_PUSH_URL` | `https://exp.host/--/api/v2/push/send` |

### Frontend — `frontend/.env.local`

| Variable | Description |
|---|---|
| `VITE_API_URL` | URL of the backend API (use `/api` for Vercel, or `http://localhost:8000` locally) |

### Mobile — `mobile/.env`

| Variable | Description |
|---|---|
| `EXPO_PUBLIC_API_URL` | URL of the backend API |

---

## Default Login

After running `python seed.py`:

| Field | Value |
|---|---|
| Email | `admin@nexware.com` |
| Password | `Admin@Nexware2024` |
| Role | `admin` |

> ⚠️ Change this password before deploying to production.

---

## Deployment

Both frontend and backend deploy to **Vercel** for free from this monorepo.

1. Import this repo on [vercel.com/dashboard](https://vercel.com/dashboard)
2. Add all the environment variables from the table above in **Project → Settings → Environment Variables**
3. Push to `main` — Vercel auto-deploys everything

---

<div align="center">
  Built with ❤️ for modern warehouse operations
</div>
