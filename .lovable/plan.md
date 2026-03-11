

## Dashboard Reorganisation Plan

### Problem
The current dashboard has 9 draggable widgets with significant data overlap:
- **QOF coverage** (BP, Smoking, HbA1c) appears in AI Insights, QOF Progress, AND Clinical Safety
- **Critical alerts count** appears in Today's Priorities, AI Insights, Risk Alerts, AND Clinical Safety
- **Task counts** appear in Today's Priorities AND MediTask
- **Quick Actions** widget duplicates the header buttons (New Batch, Upload Patients, Analytics)
- Each widget has its own card header + padding, wasting vertical space

### New Layout Structure

Consolidate 9 widgets into 4 dense, non-overlapping sections:

```text
┌─────────────────────────────────────────────────────────┐
│ Header: Greeting + Date + Action Buttons (keep as-is)   │
├────────────┬────────────┬────────────┬──────────────────┤
│ Patients   │ Calls      │ Success    │ Pending Batches  │  ← KPI row (keep)
├────────────┴────────────┴────────────┴──────────────────┤
│                                                         │
│  ┌─ Command Strip ────────────────────────────────────┐ │  ← NEW: inline action
│  │ [▶ Run Analysis] [⚡ Verify (3)] [📋 Tasks (5)]   │ │    bar replacing
│  │ [🔴 2 Critical] [🟡 4 Warnings]                    │ │    Quick Actions +
│  └────────────────────────────────────────────────────┘ │    Today's Priorities
│                                                         │
│  ┌─ Clinical Overview (2-col) ───────────────────────┐ │
│  │ LEFT: Safety & Coverage        │ RIGHT: Alerts     │ │
│  │ • Data Quality: 68%            │ • Sorted alert    │ │
│  │ • BP  ████████░░ 72%           │   list with ack   │ │
│  │ • Smoking ██████░░░ 58%        │   buttons         │ │
│  │ • HbA1c █████░░░░ 45%          │                   │ │
│  │ • ⚠ 3 diabetic w/o HbA1c      │                   │ │
│  │ • ⚠ 2 hypertensive w/o BP     │                   │ │
│  └────────────────────────────────────────────────────┘ │
│                                                         │
│  ┌─ Activity (3-col) ───────────────────────────────┐  │
│  │ QOF Progress    │ Recent Calls   │ Upcoming Batch │  │
│  │ (compact)       │ (compact)      │ (compact)      │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### Changes

**1. Remove widgets: `quick-actions`, `todays-priorities`, `meditask`**
- Quick Actions duplicates header buttons; move "Verify" and "Tasks" counts into a new compact command strip
- Today's Priorities counts merge into the command strip
- MediTask stats merge into the command strip (task count badge)

**2. Create `CommandStrip` component**
- Single horizontal bar with: Run Analysis button, Verify badge (links to `/clinical-verification`), Tasks badge (links to `/ai-tasks`), alert severity counts
- Compact: one row, no card wrapper, just a subtle bg strip

**3. Merge `ai-insights` + `clinical-safety` → `ClinicalOverview`**
- Left column: Data quality score, coverage progress bars (BP, Smoking, BMI, HbA1c, Cholesterol), safety gap warnings
- Right column: Risk alerts list (from current RiskAlertsWidget, trimmed to 4)
- Single card, 2-column layout
- Removes all duplicate QOF coverage displays

**4. Keep `qof-progress`, `recent-calls`, `upcoming-batches` as compact bottom row**
- These are unique, non-overlapping data
- Display in a fixed 3-column grid (not draggable) for stability

**5. Update `useDashboardLayout`**
- Reduce default layout to 2 draggable items: `clinical-overview`, `activity-row`
- Keep edit mode for show/hide but simplify since there are fewer widgets

**6. Update `Dashboard.tsx`**
- Replace the 9-widget grid with the new structured layout
- Remove DnD complexity (fewer widgets = less need for reordering)
- Tighter padding: `p-4 lg:p-6` instead of `p-6 lg:p-8`, `gap-4` instead of `gap-6`

### Files to Change
- `src/components/dashboard/CommandStrip.tsx` — new component
- `src/components/dashboard/ClinicalOverview.tsx` — new merged component
- `src/pages/Dashboard.tsx` — restructure layout, remove widget grid
- `src/hooks/useDashboardLayout.ts` — simplify widget list
- Remove or keep old widget files (no deletion needed, just stop importing)

