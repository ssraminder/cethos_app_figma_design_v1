# Claude Code Prompt: Fix Daily Cutoff for Delivery Date Calculation

## Context

CETHOS is a certified translation services platform. On the quote review page (Step 4), delivery dates need to account for a daily cutoff time (9 PM MST). Orders placed after the cutoff should have their delivery dates calculated from the next business day, not the current day.

## Problem

Without proper business day handling, a customer ordering at 10 PM on Friday gets Tuesday delivery instead of Wednesday. This effectively gives late-night orders free rush service.

**Example of the problem:**
- Friday 3 PM order, 2-day standard → Tuesday (correct)
- Friday 10 PM order, 2-day standard → Tuesday (WRONG - should be Wednesday)

## Expected Behavior

After 9 PM MST, delivery dates should be calculated from the **next business day**, not just +1 calendar day.

| Order Time | Start Counting From | Standard (2 days) | Rush (1 day) |
|------------|---------------------|-------------------|--------------|
| Friday 3 PM | Friday | Tuesday | Monday |
| Friday 10 PM | **Monday** | **Wednesday** | **Tuesday** |

## Your Task

### Step 1: Check if the fix is already implemented

Look for this code in `client/components/quote/Step4ReviewRush.tsx` in the `getDeliveryDate` function:

```typescript
// If past cutoff, advance to the next business day first, then count from there
if (isPastDailyCutoff) {
  date.setDate(date.getDate() + 1);
  // Skip weekends and holidays to find next business day
  while (
    isWeekend(date) ||
    holidayDates.some((h) => isSameDay(h, date))
  ) {
    date.setDate(date.getDate() + 1);
  }
}
```

**If the while loop is missing**, the fix is incomplete.

---

### Step 2: Implementation

#### File: `client/components/quote/Step4ReviewRush.tsx`

In the `getDeliveryDate` function (around line 693), ensure the code advances to the next **business day**, not just +1 calendar day:

**WRONG (incomplete):**
```typescript
if (isPastDailyCutoff) {
  date.setDate(date.getDate() + 1);  // Just +1 calendar day - Friday becomes Saturday
}
```

**CORRECT (complete):**
```typescript
// If past cutoff, advance to the next business day first, then count from there
if (isPastDailyCutoff) {
  date.setDate(date.getDate() + 1);
  // Skip weekends and holidays to find next business day
  while (
    isWeekend(date) ||
    holidayDates.some((h) => isSameDay(h, date))
  ) {
    date.setDate(date.getDate() + 1);
  }
}
```

---

### Step 3: Verify the fix

Test these scenarios:

| Scenario | Order Time | Standard Days | Expected Standard | Expected Rush |
|----------|------------|---------------|-------------------|---------------|
| 1 | Friday 3 PM | 2 | Tuesday | Monday |
| 2 | Friday 10 PM | 2 | **Wednesday** | **Tuesday** |
| 3 | Saturday anytime | 2 | Wednesday | Tuesday |

---

## Key Logic Explanation

### Flow for Friday 10 PM, 2-day standard:

**With incomplete fix (WRONG):**
1. `isPastDailyCutoff = true`
2. date = Saturday (just +1)
3. Count: Sat(skip), Sun(skip), Mon(1), Tue(2)
4. Result: Tuesday ❌

**With complete fix (CORRECT):**
1. `isPastDailyCutoff = true`
2. date = Saturday (initial +1)
3. While loop: Sat→Sun→Mon (find next business day)
4. date = Monday
5. Count: Tue(1), Wed(2)
6. Result: Wednesday ✓

---

## Files Reference

- **Main file:** `client/components/quote/Step4ReviewRush.tsx`
  - `getDeliveryDate` function: ~lines 666-708
  - The `isPastDailyCutoff` check and while loop: ~lines 693-703
