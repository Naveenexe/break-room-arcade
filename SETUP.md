# Break Room Arcade: Setup & Deployment Guide

This guide gives you the exact click-by-click steps to set up and deploy **Break Room Arcade** using 100% free tiers (Supabase, Netlify, and GitHub Actions).

---

## Step 1: Create Your Free Supabase Project (H1)
1. Go to [supabase.com](https://supabase.com) and sign in (or create a free account).
2. Click **"New Project"**.
3. Fill in the project details:
   - **Name:** `break-room-arcade` (or any name you prefer)
   - **Database Password:** Enter a strong password and save it somewhere safe.
   - **Region:** Select **South Asia (Mumbai)** (`ap-south-1`) or **Southeast Asia (Singapore)** (`ap-southeast-1`).
   - **Pricing Plan:** Select **Free plan**.
4. Click **"Create new project"** and wait about 1–2 minutes for the database to provision.

---

## Step 2: Apply Database Schema & RPC Functions (H2)
1. In your Supabase Dashboard left sidebar, click the **SQL Editor** icon (`>_`).
2. Click **"New query"** (or the green `+` button).
3. Open the file `supabase/setup.sql` in this project.
4. Copy the entire contents and paste them into the SQL Editor.
5. Click **"Run"** (or press `Ctrl+Enter` / `Cmd+Enter`).
6. You should see `Success. No rows returned` in the output pane.

---

## Step 3: Configure Authentication Settings (H3)
1. In your Supabase Dashboard left sidebar, click **Authentication** (person icon).
2. Go to **Sign In / Up** (or **Providers**) -> **Email**.
3. Ensure the following settings:
   - **Enable Email provider:** `ON`
   - **Confirm email:** `OFF` *(Important: users can play immediately without email confirmation)*
   - **Secure email change:** `OFF` (or default)
4. Under **Password requirements**:
   - Set **Minimum password length** to `6`.
5. Click **Save**.

---

## Step 4: Verify Realtime Replication (H4)
1. In the Supabase sidebar, go to **Database** -> **Replication** (or **Publications**).
2. Under `supabase_realtime`, verify that `rooms`, `room_players`, and `game_sessions` are included. (The script in Step 2 automatically adds them).

---

## Step 5: Configure Local Environment (.env.local) (H5)
1. In the Supabase Dashboard, click **Project Settings** (gear icon at the bottom of the sidebar) -> **API** (or **Data API**).
2. Locate:
   - **Project URL** (e.g., `https://abcdefghijkl.supabase.co`)
   - **Project API keys** -> **`anon` `public`** key (starts with `eyJ...`)
3. In your project folder, create a new file named `.env.local` (or copy from `.env.example`).
4. Paste your values:
   ```env
   VITE_SUPABASE_URL=https://your-project-ref.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-public-key
   ```
5. *Security Notice:* **NEVER copy or share the `service_role` key.** Only use the `anon` key.

---

## Step 6: Link to GitHub (H6)
1. Open your terminal in this project directory:
   ```bash
   git add .
   git commit -m "feat: complete Milestone 1 foundation and core architecture"
   ```
2. Create a new repository on [GitHub](https://github.com/new) named `break-room-arcade` (private or public).
3. Link and push your branch:
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/break-room-arcade.git
   git push -u origin main
   ```

---

## Step 7: Deploy to Netlify (H6 continued)
1. Go to [netlify.com](https://netlify.com) and log in.
2. Click **"Add new site"** -> **"Import an existing project"**.
3. Select **GitHub** and authorize access to your `break-room-arcade` repository.
4. Netlify will automatically detect:
   - **Build command:** `npm run build`
   - **Publish directory:** `dist`
5. Click **"Add environment variables"** and add:
   - `VITE_SUPABASE_URL` = (your Supabase Project URL)
   - `VITE_SUPABASE_ANON_KEY` = (your Supabase `anon` key)
6. Click **"Deploy break-room-arcade"**.
7. In about 1 minute, your site will be live at `https://your-site-name.netlify.app`.

---

## Step 8: Update Auth Allowed URLs (H7)
1. Once deployed, copy your live Netlify URL (e.g. `https://break-room-arcade.netlify.app`).
2. Go back to your **Supabase Dashboard** -> **Authentication** -> **URL Configuration**.
3. Set:
   - **Site URL:** `https://your-site-name.netlify.app`
   - **Redirect URLs:** Add `https://your-site-name.netlify.app/**`
4. Click **Save**.

---

## Step 9: Make Yourself the First Admin (H8)
1. Open your deployed site (or local `http://localhost:5173`), click **Get Arcade Pass**, and sign up with your email and a 6-character password.
2. Go to your **Supabase Dashboard** -> **SQL Editor** -> **New query**.
3. Run this one-line command to grant admin access to your account:
   ```sql
   update public.profiles
   set is_admin = true
   where id = (select id from auth.users where email = 'YOUR_EMAIL@EXAMPLE.COM');
   ```
4. You can now access `/admin/import` and `/admin/content`!

---

## Step 10: Automatic Keep-Alive Setup (H9)
Supabase free tier projects pause after 7 days of inactivity. We included an automated GitHub Action (`.github/workflows/keepalive.yml`) that pings your database every 3 days.
1. In your GitHub repository, go to **Settings** -> **Secrets and variables** -> **Actions**.
2. Click **"New repository secret"** and add:
   - Name: `SUPABASE_URL`, Value: your Supabase Project URL
3. Add a second secret:
   - Name: `SUPABASE_ANON_KEY`, Value: your Supabase `anon` key
4. Done! GitHub Actions will keep your Supabase project warm and active automatically.

