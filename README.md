```
 _   _           __        __
| \ | | _____  __\ \      / /_ _ _ __ ___
|  \| |/ _ \ \/ / \ \ /\ / / _` | '__/ _ \
| |\  |  __/>  <   \ V  V / (_| | | |  __/
|_| \_|\___/_/\_\   \_/\_/ \__,_|_|  \___|

Smart Warehouse Picking & Market Price Management
```

> **Nexware** is a full-stack warehouse management platform that streamlines
> order picking for warehouse operatives and provides real-time market price
> management for administrators — all from a single, unified system.

---

## Table of Contents

- [Architecture](#architecture)
- [Modules](#modules)
- [Tech Stack](#tech-stack)
- [Local Development](#local-development)
  - [Prerequisites](#prerequisites)
  - [Backend Setup](#backend-setup)
  - [Frontend Setup](#frontend-setup)
  - [Mobile Setup](#mobile-setup)
- [API Documentation](#api-documentation)
- [Default Credentials](#default-credentials)
- [Environment Variables](#environment-variables)
- [Deployment](#deployment)
  - [Vercel (Frontend & Backend)](#vercel-frontend--backend)
  - [GitHub Actions Secrets](#github-actions-secrets)
- [Contributing](#contributing)

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                          │
│                                                              │
│   ┌─────────────────────┐     ┌──────────────────────────┐  │
│   │   React Frontend    │     │  Expo Mobile App (RN)    │  │
│   │   (Vite + Vercel)   │     │  Picker / Warehouse App  │  │
│   └──────────┬──────────┘     └────────────┬─────────────┘  │
└──────────────┼──────────────────────────────┼───────────────-┘
               │  HTTPS / REST                │  HTTPS / REST
               ▼                              ▼
┌─────────────────────────────────────────────────────────────-┐
│                       API LAYER                              │
│                                                              │
│          FastAPI Backend  (Python 3.11, async)               │
│          ┌──────────────────────────────────┐                │
│          │  Auth │ Orders │ Products │ Picks │                │
│          │  Users │ Prices │ Notif.   │      │                │
│          └──────────────────────────────────┘                │
│              Deployed on Vercel Serverless Functions         │
└──────────────────────────┬───────────────────────────────────┘
                           │  asyncpg / SQLAlchemy
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                      DATA LAYER                              │
│          Supabase (PostgreSQL)  +  Row-Level Security        │
└──────────────────────────────────────────────────────────────┘
                           │
                           ▼
                  Expo Push Notifications
                  (exp.host push service)
```

---

## Modules

| Module | Description |
|---|---|
| **Auth** | JWT access + refresh tokens, role-based access (admin / picker) |
| **Users** | Admin CRUD for warehouse staff accounts |
| **Products** | Product catalogue with barcode / SKU lookup |
| **Market Prices** | Real-time supplier price tracking and management |
| **Orders** | Purchase order creation, assignment, and tracking |
| **Pick Lists** | Optimised pick-path generation for warehouse operatives |
| **Notifications** | Expo push notifications to mobile pickers on order events |

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Backend** | Python 3.11, FastAPI, SQLAlchemy (async), Alembic |
| **Database** | Supabase (PostgreSQL), asyncpg |
| **Frontend** | React 18, Vite, TypeScript, Tailwind CSS |
| **Mobile** | React Native, Expo SDK |
| **Auth** | JWT (HS256), bcrypt |
| **Containerisation** | Docker, Docker Compose |
| **CI/CD** | GitHub Actions / Vercel Auto-Deploy |
| **Backend Hosting** | Vercel Serverless Functions (Python 3.11) |
| **Frontend Hosting** | Vercel |
| **Push Notifications** | Expo Push Notification Service |

---

## Local Development

### Prerequisites

| Tool | Version |
|---|---|
| Python | ≥ 3.11 |
| Node.js | ≥ 20 LTS |
| npm | ≥ 10 |
| Docker & Docker Compose | Latest |
| Expo CLI | `npm install -g expo-cli` |
| Git | Any recent version |

---

### Backend Setup

```bash
# 1. Clone the repository
git clone https://github.com/your-org/nexware.git
cd nexware

# 2. Create and activate a virtual environment
cd backend
python -m venv .venv

# Windows
.venv\Scripts\activate
# macOS / Linux
source .venv/bin/activate

# 3. Install dependencies
pip install --upgrade pip
pip install -r requirements.txt

# 4. Configure environment variables
cp .env.example .env
# Open .env and fill in your Supabase DATABASE_URL and JWT_SECRET_KEY

# 5. Initialise the database (creates tables + default admin user)
python scripts/init_db.py

# 6. Start the development server
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

> The API will be available at **http://localhost:8000**

**Alternatively, use Docker Compose:**

```bash
# From the project root
docker compose up --build
```

---

### Frontend Setup

```bash
# From the project root
cd frontend

# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env.local
# Set VITE_API_URL to your backend URL

# 3. Start the dev server
npm run dev
```

> The web app will be available at **http://localhost:5173**

---

### Mobile Setup

```bash
# From the project root
cd mobile

# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Set EXPO_PUBLIC_API_URL to your backend URL

# 3. Start Expo
npx expo start
```

Scan the QR code with **Expo Go** on your device, or press:
- `a` — open Android emulator
- `i` — open iOS simulator
- `w` — open web preview

---

## API Documentation

The FastAPI backend auto-generates interactive API docs:

| Interface | URL |
|---|---|
| **Swagger UI** | http://localhost:8000/docs |
| **ReDoc** | http://localhost:8000/redoc |
| **OpenAPI JSON** | http://localhost:8000/openapi.json |

---

## Default Credentials

> [!CAUTION]
> Change these credentials immediately after first login in any environment other than local development.

| Field | Value |
|---|---|
| **Email** | `admin@nexware.com` |
| **Password** | `Admin@Nexware2024` |
| **Role** | `admin` |

These are created automatically when you run `python backend/scripts/init_db.py`.

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Required | Description |
|---|---|---|
| `SUPABASE_DATABASE_URL` | ✅ | Full asyncpg connection string to Supabase Postgres |
| `JWT_SECRET_KEY` | ✅ | Secret used to sign JWT tokens — use a long random string |
| `JWT_ALGORITHM` | ✅ | JWT algorithm (default: `HS256`) |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | ✅ | Admin/staff access token TTL in minutes (default: `15`) |
| `REFRESH_TOKEN_EXPIRE_DAYS` | ✅ | Admin/staff refresh token TTL in days (default: `7`) |
| `PICKER_REFRESH_TOKEN_EXPIRE_DAYS` | ✅ | Picker refresh token TTL in days (default: `30`) |
| `ALLOWED_ORIGINS` | ✅ | Comma-separated list of allowed CORS origins |
| `EXPO_PUSH_NOTIFICATION_URL` | ✅ | Expo push endpoint (default: `https://exp.host/--/api/v2/push/send`) |

### Frontend (`frontend/.env.local`)

| Variable | Required | Description |
|---|---|---|
| `VITE_API_URL` | ✅ | Base URL of the FastAPI backend (no trailing slash) |

### Mobile (`mobile/.env`)

| Variable | Required | Description |
|---|---|---|
| `EXPO_PUBLIC_API_URL` | ✅ | Base URL of the FastAPI backend (no trailing slash) |

---

## Deployment

### Vercel (Frontend & Backend)

NexWare is configured as a multi-service monorepo, allowing both the **Vite React frontend** and the **FastAPI Python backend** to be deployed seamlessly on **Vercel** for **$0.00**!

#### 1. Import Project in Vercel
1. Go to your [Vercel Dashboard](https://vercel.com/dashboard) and click **Add New → Project**.
2. Import your GitHub repository (`Vaidik26/Nexware`).
3. Vercel will automatically detect the monorepo structure via `vercel.json` and configure:
   - `frontend`: Web Service (Vite)
   - `backend`: Web Service (FastAPI Serverless Function)

#### 2. Set Environment Variables in Vercel Dashboard
In **Project → Settings → Environment Variables**, add your production database and authentication secrets:

| Variable Name | Description |
|---|---|
| `DATABASE_URL` | Supabase PostgreSQL async connection string |
| `JWT_SECRET_KEY` | Secret key used for signing JWT access and refresh tokens |
| `ALGORITHM` | JWT algorithm (default: `HS256`) |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Access token lifetime in minutes (default: `30`) |
| `REFRESH_TOKEN_EXPIRE_DAYS` | Refresh token lifetime in days (default: `7`) |
| `ALLOWED_ORIGINS` | Comma-separated list of allowed frontend domains |
| `VITE_API_URL` | Your deployed backend API URL (e.g. `https://nexware.vercel.app`) |

#### 3. Automatic Deployments
Every push to the `main` branch on GitHub automatically triggers Vercel to build and deploy both your frontend and backend simultaneously in seconds!

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Commit your changes: `git commit -m 'feat: add your feature'`
4. Push to the branch: `git push origin feature/your-feature`
5. Open a Pull Request against `main`

Please follow [Conventional Commits](https://www.conventionalcommits.org/) for commit messages.

---

<div align="center">
  Built with ❤️ for modern warehouse operations
</div>
