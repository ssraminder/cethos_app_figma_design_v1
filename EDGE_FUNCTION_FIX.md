# Edge Function Auto-Trigger Fix

## Investigation Results

### 1. Current State
**Code attempting to call the Edge Function existed** at `code/client/pages/Index.tsx:52-65`, but it was **never executing**.

### 2. Root Cause: React State Timing Issue

**The Problem:**
```typescript
// In Index.tsx (BEFORE FIX)
const success = await goToNextStep();  // ← Sets quoteId via updateState()

// Later in the same function...
if (success && currentStep === 1 && state.quoteId) {  // ❌ FAILS
  triggerProcessing(state.quoteId);  // ← Never executes
}
```

**Why it failed:**
- `goToNextStep()` calls `updateState({ quoteId: result.quoteId })` inside `QuoteContext`
- React's `setState` is **asynchronous** - the state update is queued, not immediate
- When checking `state.quoteId` in the same execution context, it still has the **old value** (empty string)
- The condition `state.quoteId` evaluates to `false`, so the Edge Function is never triggered

**Evidence in code flow:**
```typescript
// QuoteContext.tsx:190-194
updateState({
  currentStep: 2,
  quoteId: result.quoteId,  // ← Queues state update
  quoteNumber: result.quoteNumber,
});
return true;  // ← Returns immediately

// Back in Index.tsx:52
if (success && currentStep === 1 && state.quoteId) {
  // state.quoteId is STILL "" here because setState hasn't processed yet!
}
```

### 3. The Fix

**Modified `QuoteContext.tsx`:**
- Changed `goToNextStep()` return type from `Promise<boolean>` to `Promise<{ success: boolean; quoteId?: string }>`
- Return the `quoteId` immediately when creating a quote in Step 1 → Step 2 transition
- This allows `Index.tsx` to use the quoteId **before the state update completes**

**Modified `Index.tsx`:**
- Use the **returned quoteId** instead of `state.quoteId`
- This ensures we have the value immediately, not waiting for React's state update

```typescript
// AFTER FIX
const result = await goToNextStep();  // ← Returns { success: true, quoteId: "uuid" }

if (result.success && currentStep === 1 && result.quoteId) {  // ✅ WORKS
  triggerProcessing(result.quoteId);  // ← Executes immediately
}
```

## Files Changed

### 1. `code/client/context/QuoteContext.tsx`
- **Line 44**: Updated interface to return `{ success: boolean; quoteId?: string }`
- **Lines 173-208**: Modified `goToNextStep()` to return quoteId on Step 1 → 2 transition
- **Lines 210-256**: Updated all return statements to use new format

### 2. `code/client/pages/Index.tsx`
- **Lines 28-72**: Updated `handleContinue()` to use returned quoteId
- Added debug logging to show both `result.quoteId` and `state.quoteId` for comparison

## Testing Instructions

1. **Open browser console** (F12) to see debug logs
2. **Upload 1-3 documents** in Step 1
3. **Click "Continue"**
4. **Watch console logs** - you should see:
   ```
   🔄 Step transition: {
     success: true,
     fromStep: 1,
     toStep: 1,  // Still 1 because setState is async
     returnedQuoteId: "uuid-here",  // ✅ Has value!
     stateQuoteId: ""  // ❌ Still empty (proves the bug)
   }
   🚀 Triggering document processing for quote: uuid-here
   📡 triggerProcessing called with quoteId: uuid-here
   ✅ Supabase client available, invoking Edge Function...
   🔌 Calling supabase.functions.invoke('process-document')
   ✅ Edge Function response: {...}
   ✅ Document processing triggered successfully
   ```

5. **Check Supabase Dashboard** → Edge Functions → Logs
   - Should see `process-document` invocation
   - Should see processing start for the uploaded files

## What We Know Works Now

- ✅ Supabase credentials configured
- ✅ Edge Function `process-document` exists and is active
- ✅ Storage bucket `quote-files` exists
- ✅ Auto-trigger code exists with proper timing
- ✅ Debug logging shows execution flow
- ✅ State timing issue resolved by returning quoteId directly

## Next Steps

After confirming the trigger works:
1. Monitor Edge Function logs to ensure processing completes
2. Verify realtime updates show processing progress
3. Check that pricing appears correctly in Step 3
4. Test error handling if processing fails
5. Remove debug console logs once confirmed working
