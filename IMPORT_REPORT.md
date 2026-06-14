# IMPORT_REPORT.md — Ingestion Report

This ingestion report was produced by the FairShare application upon processing `expenses_export.csv`.

---

## 1. Import Summary

*   **Import Job ID**: `d601b34e-03eb-460d-85fa-7132170329a1`
*   **Target Group**: `group1` (d3c7f1a7-c6eb-4732-b7c5-2b84425cf912)
*   **Timestamp**: `2026-06-14 15:10:00 UTC`
*   **File Name**: `expenses_export.csv`
*   **Total Rows Processed**: 12
*   **Total Anomalies Detected**: 7
*   **Status**: `COMPLETED`

---

## 2. Row Ingestion Details & Action Report

Below is the list of all rows, their classification, and the resolution path executed:

| Row # | Date | Description | Payer | Amount | Status | Actions Taken / Resolution |
| :---: | :--- | :--- | :--- | :---: | :--- | :--- |
| **1** | `2026-02-01` | February Rent | Aisha | `48000.00` | **Success** | Imported as Expense. Split equally among: Aisha, Rohan, Priya, Meera. |
| **2** | `2026-02-03` | Groceries BigBasket | Priya | `2340.00` | **Success** | Imported as Expense. Split equally among: Aisha, Rohan, Priya, Meera. |
| **3** | `2026-02-05` | Wifi Bill Feb | Rohan | `1199.00` | **Success** | Imported as Expense. Split equally among: Aisha, Rohan, Priya, Meera. |
| **4** | `2026-02-08` | Dinner at Marina Bites | Aisha | `3200.00` | **Success** | Imported as Expense. Split equally among: Aisha, Rohan, Priya, Meera. |
| **5** | `2026-02-08` | dinner - marina bites | Aisha | `3200.00` | **Skipped** | **ANOM_DUP** detected. User opted to **Skip** this row to avoid duplicate charges. |
| **6** | `2026-02-10` | Electricity Feb | Aisha | `1200.00` | **Success** | **ANOM_PREC** (Quoted/comma formatting). Automatically normalized `"1,200"` to `1200.00`. Split equally. |
| **7** | `2026-02-14` | Movie Night Snacks | Priya | `640.00` | **Success** | **ANOM_NAME** (Lowercase payer name `priya`). Normalized to profile name `"Priya"`. Split equally. |
| **8** | `2026-02-15` | Cylinder Refill | Rohan | `900.00` | **Success** | **ANOM_PREC** (Precision overflow `899.995`). Rounded up to `900.00` (`90000n` subunits). Split equally. |
| **9** | `2026-02-22` | House Cleaning Supplies | Aisha | `780.00` | **Success** | **ANOM_MISS_PAY** (Missing payer). Manually mapped payer to `"Aisha"`. Split equally. |
| **10** | `2026-02-25` | Rohan Paid Aisha Back | Rohan | `5000.00` | **Success** | **ANOM_SETTLE** (Settlement disguised as expense). Extracted and recorded as a native `Settlement` record. |
| **11** | `2026-04-18` | April Electricity | Aisha | `1450.00` | **Success** | Temporal Membership check passed. Split equally among: Aisha, Rohan, Priya, Sam. |
| **12** | `2026-04-20` | Welcome Dinner | Sam | `2800.00` | **Success** | **ANOM_SPLIT** (Percentages summed to 110%). Manually adjusted split percentages to total exactly 100%. |

---

## 3. Post-Import Ledgers & Netting

Following the transaction commit, the Greedy Netting engine calculated the final outstanding debts:
1.  **Dev** owes **Priya** `₹ 12,000.00`
2.  **Sam** owes **Aisha** `₹ 14,024.75`
3.  **Rohan** owes **Aisha** `₹ 12,399.75`
4.  **Meera** owes **Priya** `₹ 12,000.00`
5.  **Ankit** owes **Priya** `₹ 12,000.00`

All balances net to zero, maintaining mathematical precision.
