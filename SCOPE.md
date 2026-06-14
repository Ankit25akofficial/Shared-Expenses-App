# SCOPE.md — Anomaly Log & Database Schema

This document details the CSV data anomalies, their resolution policies, and the database schema for the FairShare Shared Expenses application.

---

## 1. CSV Data Ingestion Anomaly Log

Below is the list of all anomalies identified in `public/expenses_export.csv` during the ingestion phase, along with how each was systematically handled:

| Row # | CSV Date | Description | Amount | Key Issue | Anomaly Code | Severity | Handling & Resolution Policy |
| :---: | :---: | :--- | :---: | :--- | :--- | :--- | :--- |
| **5** | `2026-02-08` | `dinner - marina bites` | `3200` | Fuzzy duplicate of Row 4 (Marina Bites) | `ANOM_DUP` | **MEDIUM** | **Skipped**: The user marked this row as a duplicate to bypass creation and avoid double-billing. |
| **6** | `2026-02-10` | `Electricity Feb` | `"1,200"` | Comma separators & quotes formatting | `ANOM_PREC` | **LOW** | **Normalized**: Automatically stripped commas/quotes, parsed as `1200.00`, and stored as `120000n` subunits. |
| **7** | `2026-02-14` | `Movie Night Snacks` | `640` | Lowercase name inconsistency (`priya`) | `ANOM_NAME` | **MEDIUM** | **Normalized**: Fuzzy matched `priya` with registered user `"Priya"`, linking the transaction correctly. |
| **8** | `2026-02-15` | `Cylinder Refill` | `899.995` | Value exceeds standard 2 decimal places | `ANOM_PREC` | **LOW** | **Rounded**: Rounded up to `900.00` to fit the integer subunit system (`90000n` paise/cents). |
| **9** | `2026-02-22` | `House Cleaning Supplies` | `780` | Payer field (`paid_by`) is empty | `ANOM_MISS_PAY` | **HIGH** | **Manual Assignment**: Resolved by manually mapping the payer to `"Aisha"`. |
| **10** | `2026-02-25` | `Rohan Paid Aisha Back` | `5000` | Settlement payment disguised as expense | `ANOM_SETTLE` | **MEDIUM** | **Converted**: Extracted from the expense queue and committed as a native `Settlement` record instead of an expense. |
| **12** | `2026-04-20` | `Welcome Dinner` | `2800` | Percentages sum to `110%` instead of `100%` | `ANOM_SPLIT` | **HIGH** | **Adjusted**: Corrected percentages dynamically to distribute liability proportionally to 100%. |

---

## 2. Database Schema (Prisma Schema Reference)

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

enum SplitType {
  EQUAL
  UNEQUAL
  PERCENTAGE
  SHARES
}

enum ImportJobStatus {
  PENDING
  VALIDATING
  NORMALIZING
  ANOMALY_DETECTED
  REVIEW_QUEUE
  COMPLETED
  FAILED
  REJECTED
}

enum AnomalySeverity {
  LOW
  MEDIUM
  HIGH
  CRITICAL
}

enum AnomalyStatus {
  UNRESOLVED
  RESOLVED
  OVERRIDDEN
  SKIPPED
}

enum AuditAction {
  EXPENSE_CREATE
  EXPENSE_UPDATE
  EXPENSE_DELETE
  SETTLEMENT_CREATE
  SETTLEMENT_DELETE
  GROUP_CREATE
  GROUP_UPDATE
  GROUP_MEMBERSHIP_CHANGE
  IMPORT_JOB_CREATE
  IMPORT_JOB_PROCESS
  IMPORT_ROW_RESOLVE
}

model User {
  id            String             @id @default(uuid())
  name          String?
  email         String             @unique
  passwordHash  String
  createdAt     DateTime           @default(now())
  updatedAt     DateTime           @updatedAt
  
  memberships        GroupMembership[]
  paidExpenses       Expense[]          @relation("ExpensePayer")
  participations     ExpenseParticipant[]
  sentSettlements    Settlement[]       @relation("SettlementPayer")
  receivedSettlements Settlement[]      @relation("SettlementPayee")
  auditLogs          AuditLog[]
  importJobs         ImportJob[]
  reviewedAnomalies  ImportAnomaly[]    @relation("AnomalyReviewer")
}

model Group {
  id              String             @id @default(uuid())
  name            String
  description     String?
  defaultCurrency String             @default("INR")
  createdAt       DateTime           @default(now())
  updatedAt       DateTime           @updatedAt
  
  memberships     GroupMembership[]
  expenses        Expense[]
  settlements     Settlement[]
  importJobs      ImportJob[]
}

model GroupMembership {
  id        String    @id @default(uuid())
  groupId   String
  userId    String
  joinedAt  DateTime  @default(now())
  leftAt    DateTime?
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt

  group     Group     @relation(fields: [groupId], references: [id], onDelete: Cascade)
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([groupId, userId])
  @@index([joinedAt, leftAt])
}

model Expense {
  id          String               @id @default(uuid())
  groupId     String
  description String
  amount      BigInt               // Stored in lowest currency subunit
  currency    String
  date        DateTime
  payerId     String
  splitType   SplitType
  createdAt   DateTime             @default(now())
  updatedAt   DateTime             @updatedAt
  deletedAt   DateTime?

  group       Group                @relation(fields: [groupId], references: [id], onDelete: Cascade)
  payer       User                 @relation("ExpensePayer", fields: [payerId], references: [id])
  participants ExpenseParticipant[]
  auditLogs   AuditLog[]           @relation("ExpenseAudits")

  @@index([groupId, date])
}

model ExpenseParticipant {
  id          String   @id @default(uuid())
  expenseId   String
  userId      String
  owedAmount  BigInt   // Share of expense in subunits
  splitValue  Decimal  // Stores percentages, share count, or raw unequal shares
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  expense     Expense  @relation(fields: [expenseId], references: [id], onDelete: Cascade)
  user        User     @relation(fields: [userId], references: [id])

  @@unique([expenseId, userId])
}

model Settlement {
  id          String   @id @default(uuid())
  groupId     String
  payerId     String
  payeeId     String
  amount      BigInt   // Stored in subunits
  currency    String
  date        DateTime @default(now())
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  group       Group    @relation(fields: [groupId], references: [id], onDelete: Cascade)
  payer       User     @relation("SettlementPayer", fields: [payerId], references: [id])
  payee       User     @relation("SettlementPayee", fields: [payeeId], references: [id])

  @@index([groupId])
}

model ImportJob {
  id          String           @id @default(uuid())
  groupId     String
  userId      String
  fileName    String
  status      ImportJobStatus  @default(PENDING)
  rowCount    Int              @default(0)
  createdAt   DateTime         @default(now())
  updatedAt   DateTime         @updatedAt

  group       Group            @relation(fields: [groupId], references: [id], onDelete: Cascade)
  user        User             @relation(fields: [userId], references: [id])
  rows        ImportRow[]
  anomalies   ImportAnomaly[]
}

model ImportRow {
  id                 String          @id @default(uuid())
  jobId              String
  rowNumber          Int
  rawData            Json
  status             AnomalyStatus   @default(UNRESOLVED)
  normalizedExpense  Json?
  createdAt          DateTime        @default(now())
  updatedAt          DateTime        @updatedAt

  job                ImportJob       @relation(fields: [jobId], references: [id], onDelete: Cascade)
  anomalies          ImportAnomaly[]

  @@unique([jobId, rowNumber])
}

model ImportAnomaly {
  id            String          @id @default(uuid())
  jobId         String
  rowNumber     Int
  rowId         String
  type          String
  severity      AnomalySeverity
  message       String
  originalValue String?
  suggestedFix  String?
  status        AnomalyStatus   @default(UNRESOLVED)
  actionTaken   String?
  reviewedById  String?
  createdAt     DateTime        @default(now())
  updatedAt     DateTime        @updatedAt

  job           ImportJob       @relation(fields: [jobId], references: [id], onDelete: Cascade)
  row           ImportRow       @relation(fields: [rowId], references: [id], onDelete: Cascade)
  reviewer      User?           @relation("AnomalyReviewer", fields: [reviewedById], references: [id])

  @@index([jobId, status])
}

model ExchangeRate {
  id           String   @id @default(uuid())
  fromCurrency String
  toCurrency   String
  rate         Decimal
  date         DateTime

  @@unique([fromCurrency, toCurrency, date])
}

model AuditLog {
  id          String      @id @default(uuid())
  userId      String?
  action      AuditAction
  entityName  String
  entityId    String
  oldValues   Json?
  newValues   Json?
  createdAt   DateTime    @default(now())

  user        User?       @relation(fields: [userId], references: [id], onDelete: SetNull)
  expense     Expense?    @relation("ExpenseAudits", fields: [entityId], references: [id], map: "AuditLog_entityId_fkey_Expense", onDelete: Cascade)
}
```
