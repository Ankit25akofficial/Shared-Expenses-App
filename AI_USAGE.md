# AI_USAGE.md — AI Tools & Usage Log

This document details the AI tools used, the key prompts executed, and three concrete cases where the AI produced errors, how they were identified, and how they were corrected.

---

## 1. AI Tools & Agents Used

*   **Primary Assistant**: **Antigravity** (An agentic AI coding assistant developed by the Google DeepMind team).
*   **Subagents**:
    *   `research` subagent: Used for read-only codebase scanning and searches.
    *   `self` subagent: Used for isolated task running and test verification.

---

## 2. Key Prompts

Throughout the lifecycle of this project, key user prompts included:
1.  *“why im unable to add another member”* (debugging authentication and membership boundaries).
2.  *“date,description,paid_by,amount,currency,split_type,split_with,split_details,notes ... [CSV text]”* (bootstrapping the CSV ingestion schema).
3.  *“unable to see any history”* (resolving view filters and transaction trail querying).
4.  *“now add all data and add all 7 member and 12 data entry”* (triggering database seeding and member generation).
5.  *“https://github.com/Ankit25akofficial/Shared-Expenses-App put it into my github also...”* (initializing git remote and pushing files).
6.  *“ADD 7 meaningful commit”* (orchestrating the commit structure).

---

## 3. Concrete Cases of AI Failures & Corrections

### Case 1: Database Connection Timeout on Prisma Transactions
*   **AI Error**: The AI initially wrapped the CSV ingestion database writes in a callback-style transaction `prisma.$transaction(async (tx) => { ... })`. In serverless database proxies (such as Neon or `db.prisma.io`), this caused cold-start query connection failures (`P1001` / `P2028` timeout).
*   **Detection**: Caught via console logs outputting:
    ```
    Invalid prisma.groupMembership.findFirst() invocation:
    Can't reach database server at db.prisma.io:5432
    ```
*   **Resolution**: Replaced nested callback transactions with sequential database queries inside the migration scripts, and modified `DATABASE_URL` to include configuration options `connect_timeout=30&pool_timeout=30` to raise database resilience.

### Case 2: Unix Shell Separator Chaining in PowerShell
*   **AI Error**: The AI tried to run sequential Git commands using Unix-style double-ampersand chaining (e.g. `git add . && git commit -m "..."`).
*   **Detection**: The Windows host machine running PowerShell rejected the `&&` token and threw a terminal syntax parsing error.
*   **Resolution**: Adjusted statements to execute sequentially or separated them using the Windows/PowerShell semicolon (`;`) operator.

### Case 3: Duplicate JSDoc Headers in `src/lib/splits.ts`
*   **AI Error**: During file modifications in `src/lib/splits.ts`, the AI appended a detailed JSDoc comment header but left the original short JSDoc header in place, creating duplicate documentation blocks right above the `calculateSplits` function.
*   **Detection**: Detected during manual verification when viewing the file with the `view_file` tool.
*   **Resolution**: Cleaned up the file using `replace_file_content`, merging the duplicate headers into a single, unified JSDoc block.
