# FairShare — Shared Expenses Management App

FairShare is a production-grade, multi-currency shared expenses management web application. It simplifies, balances, and resolves complex shared costs among flatmates, roommates, and travel groups. 

It is built with **Next.js 15 (App Router & Turbopack)**, **Prisma ORM**, **PostgreSQL**, and **NextAuth.js**.

---

## 🚀 Key Features

*   **Multi-Currency Expense Management**: Log transactions in `INR`, `USD`, or any currency. Balances are isolated and computed cleanly per currency.
*   **Temporal Membership Dates**: Members can join, leave, or rejoin a group. The application ensures they are only charged for expenses that occurred during their active membership periods.
*   **Fuzzy CSV Import Pipeline (8 Stages)**: Staging, parsing, normalization, 12-rule anomaly checking (duplicate detection, spelling variations, invalid dates), user-driven review, and single-transaction database commit.
*   **Greedy Netting Engine**: Minimizes the total number of peer-to-peer transactions required to settle up using a graph netting algorithm ($\mathcal{O}(N \log N)$ complexity).
*   **Member Ledger Reports**: Granular, print-friendly transaction trails for each member.
*   **Audit Logging**: Every mutation (add/remove member, update expense, cancel settlement) writes an immutable tracking record to the `AuditLog` table.

---

## 🛠 Tech Stack

*   **Frontend**: Next.js 15, Tailwind CSS, Lucide React icons.
*   **Backend**: Next.js App Router API endpoints.
*   **Database**: PostgreSQL.
*   **ORM**: Prisma.
*   **Authentication**: NextAuth.js (Credentials login).
*   **Testing**: Native Node.js test runner with TypeScript support (`npx tsx --test`).

---

## 📖 How It Works

### 1. Database Schema
The schema contains 11 core models:
*   `User`: Authentication and profile details.
*   `Group`: Boundary for expenses and settlements.
*   `GroupMembership`: Timeframe tracking (`joinedAt`, `leftAt`) of memberships.
*   `Expense`: Financial records (amount stored in cents/paise as `BigInt` to prevent float rounding errors).
*   `ExpenseParticipant`: Tracks split weight (`splitValue`) and calculated share (`owedAmount`).
*   `Settlement`: Log of peer-to-peer payments.
*   `ImportJob`, `ImportRow`, `ImportAnomaly`: Stages imports without polluting main transactional tables.
*   `ExchangeRate`: Cached currency exchange rates.
*   `AuditLog`: Immutable change tracker.

### 2. Anomaly Detection Engine
During CSV upload, each row is checked against 12 validation rules:
*   `ANOM_DUP`: Identifies fuzzy duplicates (similar description, same date, matching amount).
*   `ANOM_MEMB`: Ensures participants were active in the group on the expense date.
*   `ANOM_SPLIT`: Validates percentage splits sum to 100%.
*   `ANOM_MISS_PAY`: Flags blank or invalid payers.
*   `ANOM_PREC`: Rounds fractionals to 2 decimal places.
*   `ANOM_SETTLE`: Detects settlements disguised as expenses.

### 3. Greedy Netting Algorithm
For each currency, it computes the net balances ($Net_i = Paid_i - Owed_i + Sent_i - Received_i$):
1. Separates members into **Debtors** ($Net < 0$) and **Creditors** ($Net > 0$).
2. Sorts debtors (most negative first) and creditors (most positive first).
3. Matches the largest debtor and creditor, settles the maximum possible amount, updates their balances, and repeats until all balances net to zero.

---

## 💻 Local Development Setup

### Prerequisites
*   Node.js (v18 or higher)
*   PostgreSQL database (local or cloud-hosted)

### Steps

1.  **Clone the Repository**:
    ```bash
    git clone https://github.com/Ankit25akofficial/Shared-Expenses-App.git
    cd Shared-Expenses-App
    ```

2.  **Install Dependencies**:
    ```bash
    npm install
    ```

3.  **Configure Environment Variables**:
    Create a `.env` file in the root directory:
    ```env
    # PostgreSQL database connection URL (direct for migrations, pooled for app)
    DATABASE_URL="postgresql://username:password@host:5432/database?sslmode=require&connection_limit=1&connect_timeout=30"

    # NextAuth settings
    NEXTAUTH_SECRET="your-minimum-32-chars-long-secret-key"
    NEXTAUTH_URL="http://localhost:3000"
    ```

4.  **Push Database Schema & Generate Prisma Client**:
    ```bash
    npx prisma db push
    npx prisma generate
    ```

5.  **Run Tests**:
    Verify the calculations and engines:
    ```bash
    npm run test
    ```

6.  **Run Development Server**:
    ```bash
    npm run dev
    ```
    Open [http://localhost:3000](http://localhost:3000) to view the app.
    *   **Seed Account**: Access the `/api/setup-test-data` GET endpoint in the browser to auto-populate members, passwords, and CSV entries under `group2`.

---

## 🌍 Step-by-Step Deployment Guide (Production Hosting)

To host this application in production with a PostgreSQL database, follow these steps:

### Phase 1: Database Provisioning
You need a PostgreSQL database. You can use platforms like **Supabase**, **Neon**, **Railway**, or **Aiven**.
1. Create a database instance on your chosen platform.
2. Retrieve the **Pooled connection string** (for application traffic) and the **Direct connection string** (for migrations).
3. Ensure SSL is enabled (append `?sslmode=require` to the string).

### Phase 2: Next.js Frontend & API Deployment (Vercel / Render / Netlify)

#### Option A: Vercel (Recommended)
1. Import your GitHub repository to Vercel.
2. In **Project Settings**, configure the following environment variables:
    *   `DATABASE_URL`: Set to your pooled PostgreSQL connection string. (Note: add `&connection_limit=1` to avoid exhausting connection pools on free tiers).
    *   `NEXTAUTH_SECRET`: A secure random string (e.g. generate via `openssl rand -base64 32`).
    *   `NEXTAUTH_URL`: Your Vercel deployment URL (e.g., `https://your-app-name.vercel.app`).
3. Set the **Build Command** to:
    ```bash
    npx prisma generate && next build
    ```
4. Click **Deploy**.

#### Option B: Render / Docker Hosting
1. Create a **Web Service** on Render linked to your repository.
2. Add environment variables: `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`.
3. Set **Build Command**:
    ```bash
    npm install && npx prisma generate && npm run build
    ```
4. Set **Start Command**:
    ```bash
    npm run start
    ```

### Phase 3: Post-Deployment Migrations
Since Prisma is used, you must synchronize your production database:
1. Install Prisma CLI globally or use `npx` locally.
2. Run `npx prisma db push` with the direct database connection string loaded in your environment to bootstrap the PostgreSQL schemas on your production server.
3. Access the `/register` page to create your first administrative user.

---

## 📜 License
This project is licensed under the MIT License.
