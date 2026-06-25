# Selected Seat Summary Legacy Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the right-side selected-seat panel so it matches the legacy Wanda app flow, including removable seat chips, total/actual-pay summary, and discount calculator behavior.

**Architecture:** Keep the data source in the ticket store so the seat map, selected-seat panel, and payment submission share one calculation chain. Rebuild the UI in the existing `SelectedSeatList.vue` component and wire it from `TicketView.vue` without introducing a new abstraction layer.

**Tech Stack:** Vue 3, Pinia, Element Plus, TypeScript

---

### Task 1: Add selected-seat preview totals in the ticket store

**Files:**
- Modify: `D:/bily/win-ia32-unpacked/wanda-ticket-1.0.0/src/renderer/stores/ticket.ts`

- [ ] Add getters for selected-seat original total, preview payable amount, preview discount amount, and selected-card preview deduction.
- [ ] Reuse the current activity/card/coupon state instead of creating a second pricing model.
- [ ] Keep seat removal and seat-map sync on the existing `toggleSeat` action.

### Task 2: Restore the selected-seat side panel UI

**Files:**
- Modify: `D:/bily/win-ia32-unpacked/wanda-ticket-1.0.0/src/renderer/components/SelectedSeatList.vue`
- Modify: `D:/bily/win-ia32-unpacked/wanda-ticket-1.0.0/src/renderer/views/TicketView.vue`

- [ ] Replace the simplified selected-seat list with legacy-style removable seat chips.
- [ ] Restore the summary row with `合计` / `实付` / discount calculator.
- [ ] Wire the component so removing a chip toggles the same seat in the seat map.

### Task 3: Verify and finalize

**Files:**
- Verify: `D:/bily/win-ia32-unpacked/wanda-ticket-1.0.0`

- [ ] Run the project build to catch template / TypeScript regressions.
- [ ] Review the diff to ensure the implementation follows existing project style.
- [ ] Commit the completed legacy-alignment changes.
