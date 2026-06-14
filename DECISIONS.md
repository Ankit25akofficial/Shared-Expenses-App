# DECISIONS.md — Architecture & Engineering Decision Log

This document records the major design, architectural, and library choices made during the development of the FairShare Shared Expenses application.

---

## 1. Subunit BigInt Storage vs. Floating Point Numbers

*   **Problem**: How to represent monetary amounts in database tables.
*   **Options Considered**:
    *   **Option A**: Store decimal amounts as floats/doubles (e.g. `450.50` as float).
    *   **Option B**: Store integer subunits (cents/paise) as `BigInt` (e.g. `450.50` as `45050` BigInt).
*   **Decision**: **Option B (Integer Subunits via BigInt)**.
*   **Rationale**: JavaScript numbers are represented as IEEE 754 double-precision floats. Floating-point arithmetic introduces rounding errors (e.g., `0.1 + 0.2` evaluates to `0.30000000000000004`). In a shared expense system with large amounts and micro-divisions, float drift can result in missing or extra cents. BigInt ensures absolute mathematical precision. Amounts are converted back to decimal representation solely for the UI/display boundary.

---

## 2. CSV Staging Pipeline vs. Direct Database Ingestion

*   **Problem**: How to handle invalid, incomplete, or duplicate entries during CSV uploads.
*   **Options Considered**:
    *   **Option A**: Parse and write rows directly to production `Expense` and `Settlement` tables, rolling back the transaction if an issue is found.
    *   **Option B**: Write raw CSV rows to intermediate staging tables (`ImportJob`, `ImportRow`, `ImportAnomaly`) to analyze, flag issues, let users review, and then transfer to production records.
*   **Decision**: **Option B (Intermediate Staging Pipeline)**.
*   **Rationale**: Option A forces the entire upload to fail if a single row has an anomaly (like a typo in a name). Option B allows the system to capture all records safely, detect 12 classes of anomalies, and present a correction dashboard to the user. Valid rows can be immediately processed, while incorrect ones are adjusted interactively. This prevents database pollution and ensures database constraint integrity.

---

## 3. Dynamic Temporal Membership tracking vs. Simple Boolean Flags

*   **Problem**: How to determine user liability for expenses over time (e.g., a member joins halfway through the year).
*   **Options Considered**:
    *   **Option A**: Keep a simple boolean flag `isActive` or a basic list of members on the `Group` model.
    *   **Option B**: Establish a `GroupMembership` junction table tracking `joinedAt` and `leftAt` dates.
*   **Decision**: **Option B (Temporal Membership Tracking)**.
*   **Rationale**: Flatmates join and leave groups at different points in time. If we use a simple boolean, calculating historical debts or charging current members for expenses that occurred before they joined (or after they left) results in financial incorrectness. The `GroupMembership` table enables interval-based validation ($D_{exp} \in [T_{join}, T_{leave}]$) to ensure users are only charged for expenses during active membership.

---

## 4. Native Node.js Test Runner vs. Jest/Vitest

*   **Problem**: Choice of unit and integration test runner.
*   **Options Considered**:
    *   **Option A**: Configure a Jest or Vitest test suite.
    *   **Option B**: Utilize Node's native test runner (`node:test`) coupled with `tsx`.
*   **Decision**: **Option B (Native Node.js Test Runner)**.
*   **Rationale**: Since Node.js v20/22, a native high-performance test runner is built into the runtime. In combination with `tsx`, it runs TypeScript tests instantly with zero build step, no complex configuration files, and zero npm dependency bloat. This makes the testing environment simple, maintainable, and extremely fast.
