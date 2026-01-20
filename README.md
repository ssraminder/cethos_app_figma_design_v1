# Next.js Files for HITL Staff Portal

## Installation Instructions

### Step 1: Install Dependencies

```bash
npm install @supabase/auth-helpers-nextjs @supabase/supabase-js
```

### Step 2: Copy Files to Your Project

Copy the entire folder structure from this download into your Next.js project root.

Your project should look like this after copying:

```
your-project/
├── app/
│   ├── admin/
│   │   ├── layout.tsx              ← NEW
│   │   ├── login/
│   │   │   └── page.tsx            ← NEW
│   │   ├── auth/
│   │   │   └── callback/
│   │   │       └── route.ts        ← NEW
│   │   └── hitl/
│   │       └── page.tsx            ← NEW
│   └── ... (your existing pages)
├── contexts/
│   └── StaffAuthContext.tsx        ← NEW
├── middleware.ts                   ← NEW (project root!)
├── package.json
└── ...
```

### Step 3: Update Your Environment Variables

Make sure you have these in your `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://lmzoyezvsjgsxveoakdr.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### Step 4: Update Path Aliases (if needed)

The files use `@/contexts/StaffAuthContext` imports. If you don't have path aliases set up, either:

**Option A:** Add to `tsconfig.json`:
```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./*"]
    }
  }
}
```

**Option B:** Change the imports to relative paths:
```typescript
// In app/admin/layout.tsx and app/admin/hitl/page.tsx
import { StaffAuthProvider } from '../../contexts/StaffAuthContext';
```

### Step 5: Deploy and Test

1. Run your dev server: `npm run dev`
2. Go to `http://localhost:3000/admin/login`
3. Enter your staff email (must be in `staff_users` table)
4. Check email for magic link
5. After clicking link, you'll be redirected to `/admin/hitl`

### Step 6: Link Your Auth User to Staff User

After your first login, run this SQL in Supabase:

```sql
UPDATE staff_users 
SET auth_user_id = (
  SELECT id FROM auth.users WHERE email = 'your-email@example.com'
)
WHERE email = 'your-email@example.com';
```

## File Summary

| File | Purpose |
|------|---------|
| `middleware.ts` | Protects all `/admin/*` routes, requires staff auth |
| `contexts/StaffAuthContext.tsx` | React context for staff authentication state |
| `app/admin/layout.tsx` | Wraps admin pages with auth provider |
| `app/admin/login/page.tsx` | Staff login page with magic link |
| `app/admin/auth/callback/route.ts` | Handles magic link redirect |
| `app/admin/hitl/page.tsx` | HITL queue dashboard (working example) |

## Troubleshooting

### "Not authorized" error after login
- Check that your email exists in `staff_users` table
- Make sure `auth_user_id` is linked (Step 6)
- Verify `is_active = true` for your staff user

### Middleware not working
- Make sure `middleware.ts` is in the project ROOT, not in `app/`
- Check that the file is named exactly `middleware.ts`

### Imports not resolving
- Check your `tsconfig.json` has the correct path aliases
- Or update imports to use relative paths
