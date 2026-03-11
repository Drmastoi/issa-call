

## UI Improvement Plan

After reviewing the full codebase — Dashboard, AI Analytics, Patients, Sidebar, and widget components — here are targeted UI improvements across the application.

### 1. Sidebar Enhancements
- Add the ISSA Care logo to the sidebar header (currently empty `div`)
- Add a collapse/expand toggle button visible at all times
- Show a "MediTask" link in the main nav (currently only accessible via dashboard widget)
- Animate sidebar transitions more smoothly

### 2. Dashboard Refinements
- Add skeleton loading states to the stats grid cards instead of showing "0" while loading
- Improve the stat cards with micro-sparkline charts (tiny inline trend lines) using recharts
- Add a "Last updated" timestamp in the header area
- Make the widget grid responsive: 1 column on mobile, 2 on tablet, 3 on desktop (currently all widgets stack the same way)

### 3. AI Analytics Page Polish
- The 1352-line file is dense; break the KPI stats row into a reusable `KPICard` component for consistency
- Add a "Refresh data" button to the header
- Improve the empty "Action List" tab — it just redirects to AI Tasks; either remove the tab entirely or inline a preview of top 5 tasks
- Add loading skeletons for the charts while data is fetching
- Make the cohort cards clickable to filter the QOF indicators below

### 4. Patient List Page
- Add column sorting (by name, date added, NHS number)
- Add pagination controls (currently limited by the 1000-row Supabase default)
- Show a patient count summary badge in the header
- Add a "bulk select" checkbox column for batch operations

### 5. Global UI Consistency
- Standardise card header patterns: some use icon+title+description pattern, others use plain text — unify to the icon-in-rounded-bg pattern used in Analytics
- Add consistent hover micro-animations (the `hover:-translate-y-0.5` effect is only on Dashboard stats, not elsewhere)
- Add a global loading bar or progress indicator at the top of the layout during data fetches

### 6. Accessibility & Responsiveness
- Add `aria-label` attributes to icon-only buttons (export, filter buttons)
- Ensure all interactive elements have visible focus rings
- Test and fix sidebar behaviour on mobile (currently no hamburger menu or overlay)

### Technical Approach
- Create a shared `KPICard` component used by both Dashboard and Analytics
- Extract sidebar logo + collapse into the existing `AppSidebar` component
- Add skeleton variants to existing widget components
- Use `useIsMobile` hook to conditionally render mobile sidebar overlay
- All changes are purely frontend — no database migrations needed

### File Changes
- `src/components/layout/AppSidebar.tsx` — logo, collapse button, MediTask nav link
- `src/pages/Dashboard.tsx` — skeleton states, responsive grid improvements
- `src/pages/AIAnalytics.tsx` — remove or improve Action List tab, loading states, refresh button
- `src/components/dashboard/KPICard.tsx` — new shared component
- `src/pages/Patients.tsx` — sorting, pagination, bulk select
- `src/components/layout/AppLayout.tsx` — mobile sidebar overlay

