# Journaling Workspace Implementation Plan

## 🎯 Goal and Overview

The objective of this plan is to build a comprehensive "Journaling Workspace." This feature will provide users with a dedicated, detailed dashboard to manually record and analyze trade data for any trading account (whether connected or not). The primary goal is to move beyond basic trade execution logs by creating a rich, actionable analytics hub that aids in behavioral review, performance analysis, and knowledge retention.

## 🛠️ I. Core Data Model Requirements

To support the desired features, the core `JournalEntry` data model must be robust enough to capture both fundamental trade details and qualitative notes/context.

### A. Journal Entry Schema (Database Table/Data Structure)

| Field Name | Data Type | Description | Required? | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `journal_id` | UUID/Integer | Primary Key, Unique ID for the entry. | Yes | |
| `account_name` | String | The account this trade relates to (e.g., "Manual Test Account"). | Yes | Allows grouping of journals by account. |
| `symbol` | String | The instrument traded (e.g., BTCUSD, SPX). | Yes | |
| `side` | Enum/String | Buy (Long) or Sell (Short). | Yes | |
| `volume` | Float | Contract volume or lot size. | Yes | |
| `open_time_utc` | DateTime (UTC) | Time the trade was opened. | Yes | Used for duration calculations. |
| `close_time_utc` | DateTime (UTC) | Time the trade was closed. | Yes | Null if open/incomplete entry. |
| `open_price` | Float | Price at open time. | Yes | |
| `close_price` | Float | Price at close time. | Yes | |
| `profit_loss_raw` | Float | Calculated gross profit (Volume * (Close - Open)). | Yes | The raw P&L for the trade. |
| `gross_profit` | Float | Same as `profit_loss_raw`. | Yes | Used for metrics calculation. |
| `duration_minutes` | Integer | Time elapsed between open and close in minutes. | Optional | Calculated field (or stored if critical). |
| `notes` | Text/LongString | Detailed personal notes about the trade execution, strategy used, etc. | No | Critical feature for journaling context. |

## 🖥️ II. Feature Breakdown & Implementation Plan

### A. The Dashboard (`JournalDashboard`) - The Single Source of Truth

This dashboard will be the landing page upon accessing a specific Account's Journal Workspace. It must provide an immediate, holistic view of performance.

1.  **Account Summary Card:**
    *   Total P&L (All Time/Period).
    *   Overall Win Rate (Percentage).
    *   Profit Factor (Current Period).
    *   Highest Equity Reached (If modeled).
2.  **Calendar View Component:**
    *   Display: A monthly calendar widget.
    *   Functionality: Each date cell must visually represent the activity level.
        *   Total Trades Executed per day (e.g., a counter or colored dot).
        *   Total P&L for that specific day.
    *   Interaction: Clicking a day filters the main trading history to show only trades from that date.

3.  **Trading History Table View:**
    *   This is the detailed, filterable log of all entries for the selected account/timeframe.
    *   **Columns:** Must include all essential fields (`Ticket` (if available), `Open Time`, `Open Price`, `Close Time`, `Close Price`, `Side`, `Symbol`, `Volume`, `Gross Profit`, `Win/Loss`).
    *   **Functionality:** Advanced filtering (by Symbol, Side, Date Range) and sorting.

### B. Key Metrics & Analysis Components (`JournalDashboard` continuation)

These sections should be designed as interactive charts or metric cards for visual analysis.

1.  **PnL Distribution By Duration (Histogram/Chart):**
    *   Shows how P&L is distributed across different time brackets (e.g., 0-30 min, 30-60 min, >2hr). Identifies profitable duration ranges.
2.  **PnL by Trade Duration (Scatter Plot/Line Chart):**
    *   Tracks the average P&L associated with specific durations over time.
3.  **Contract Profit Analysis:**
    *   A breakdown (potentially a pie chart or bar graph) showing profit contribution by contract type or instrument group.
4.  **Contract Volume Analysis:**
    *   Similar to above, visualizing where the most trading activity (volume) occurs.
5.  **Core Performance Metrics Cards:**
    *   Trade Win Rate (`Wins / Total Trades`).
    *   Profit Factor (`Gross Profits / Gross Losses`).
    *   Consistency (A measure of standard deviation/variance in daily P&L).
    *   Average Win / Average Loss ($\frac{\text{Sum Wins}}{\text{Total Wins}}$ vs. $\frac{|\text{Sum Losses}|}{\text{Total Losses|}}$).
    *   Highest Equity Reached (Requires tracking cumulative balance over time).

### C. Notes and Reporting Features

1.  **Adding/Editing Notes:**
    *   When a user views or creates an entry, the `Notes` field must be prominent. This allows for qualitative data capture ("Entered early due to news sentiment," "Took profit too soon").
2.  **Report Generation & Download:**
    *   **Mechanism:** Users must define a reporting period and scope (Account/Symbol).
    *   **Output Format:** CSV or PDF recommended.
    *   **Content:** The report *must* include all structured trade data fields **AND** the corresponding `Notes` for each entry, providing complete context for review.

## ⚙️ III. Technical Implementation Plan (Milestones)

### Phase 1: Data Foundation & CRUD (Minimum Viable Product)
*   Implement the `JournalEntry` schema in the database.  
*   Build the API endpoints for **C**reate, **R**ead, **U**pdate, **D**elete journal entries.
*   Develop a basic UI form allowing manual entry of all core fields (Symbol, Side, Prices, Dates, Notes).

### Phase 2: Dashboard & Analytics (Core Functionality)
*   Build the primary `JournalDashboard` view.
*   Implement the Calendar View component and date filtering logic.
*   Develop calculation services for Win Rate, Profit Factor, Avg Win/Loss based on retrieved data.
*   Implement the detailed Trade History table with basic filtering.

### Phase 3: Advanced Metrics & Reporting (Polish)
*   Implement complex metric charts (PnL Distribution by Duration, Contract Analysis). This may require specialized charting libraries.
*   Finalize Report Generation endpoints to package structured data + notes into downloadable formats (CSV/PDF).
*   Testing and refinement of the user experience, particularly for adding contextual notes.

## 📝 IV. Dependencies & Considerations

1.  **Time Zones:** All timestamps must be stored and displayed as UTC to ensure accuracy globally.
2.  **Data Integrity:** Implement validation rules on all input fields (e.g., Close Time cannot predate Open Time; Prices/Volumes must be numeric).
3.  **User Guidance:** Provide tooltips or examples when a user enters notes, suggesting what kind of context is valuable for future analysis.

---