# 🚀 Supabase Quick Start Guide

Get your CETHOS quote wizard connected to Supabase in 5 minutes!

## Prerequisites

- A Supabase account (free tier works fine)
- CETHOS app running locally

## Step 1: Create Supabase Project (2 min)

1. Go to https://supabase.com and sign in
2. Click "New Project"
3. Fill in:
   - **Name:** `cethos-quotes` (or any name)
   - **Database Password:** (save this somewhere safe)
   - **Region:** Choose closest to you
4. Click "Create new project"
5. Wait ~2 minutes for setup to complete

## Step 2: Get Your Credentials (1 min)

1. In your Supabase project, click the **Settings** gear icon (bottom left)
2. Go to **API** section
3. Copy these two values:
   - **Project URL** (looks like `https://xxxxx.supabase.co`)
   - **anon public** key (long JWT token)

## Step 3: Add to Your App (30 sec)

Open your `.env` file and update:

```env
VITE_SUPABASE_URL=paste_your_project_url_here
VITE_SUPABASE_ANON_KEY=paste_your_anon_key_here
```

**Important:** Replace the placeholder text with your actual values!

## Step 4: Set Up Database (1 min)

1. In Supabase dashboard, go to **SQL Editor** (left sidebar)
2. Click **New Query**
3. Open `SUPABASE_SCHEMA.md` in your code editor
4. **Copy ALL the SQL code** from that file
5. **Paste** into the Supabase SQL Editor
6. Click **Run** (or press Ctrl/Cmd + Enter)
7. Wait for "Success" message

## Step 5: Create Storage Bucket (30 sec)

1. In Supabase dashboard, go to **Storage** (left sidebar)
2. Click **Create a new bucket**
3. Fill in:
   - **Name:** `quote-files` (exact name, no spaces)
   - **Public:** Toggle OFF (keep it private)
4. Click **Create bucket**
5. Click on the `quote-files` bucket
6. Go to **Policies** tab
7. Click **New Policy** → **Create a custom policy**
8. Copy/paste the storage policies from `SUPABASE_SCHEMA.md`

## Step 6: Restart Your App (10 sec)

```bash
# Stop the dev server (Ctrl+C)
# Then restart:
pnpm dev
```

## ✅ Test It!

1. Open http://localhost:5173 (or your dev URL)
2. Upload a test PDF file
3. Fill in all the form steps
4. Submit the quote

### Verify in Supabase:

**Check Tables:**
1. Go to **Table Editor** in Supabase
2. Click on `quotes` table → you should see 1 row
3. Click on `customers` table → you should see 1 row
4. Click on `quote_files` table → you should see rows for your files

**Check Storage:**
1. Go to **Storage** → `quote-files`
2. You should see a folder with your quote ID
3. Inside should be your uploaded files

## 🎉 Done!

Your quote wizard is now backed by Supabase!

## Need Help?

### Common Issues

**"Supabase environment variables are not set"**
- Check `.env` has the correct variable names (`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`)
- Restart dev server after changing `.env`

**Files not uploading**
- Make sure storage bucket is named exactly `quote-files`
- Verify storage policies are set up
- Check browser console for errors

**Database errors**
- Make sure you ran ALL the SQL from `SUPABASE_SCHEMA.md`
- Check that RLS policies are enabled
- Verify anon key is correct

**Still stuck?**
- Check the detailed guide: `SUPABASE_INTEGRATION.md`
- Review database schema: `SUPABASE_SCHEMA.md`
- Look for errors in:
  - Browser console (F12)
  - Terminal where dev server is running
  - Supabase Logs (in dashboard)

## What's Next?

Your app now:
- ✅ Saves quotes to database
- ✅ Uploads files to cloud storage
- ✅ Tracks customers
- ✅ Calculates pricing
- ✅ Has localStorage backup

For production deployment, consider:
- Adding user authentication
- Implementing payment processing
- Setting up email notifications
- Creating an admin dashboard

See `SUPABASE_INTEGRATION.md` for more details!
