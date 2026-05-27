# Dashboard App

React dashboard workspace for reading OmniSense telemetry from Supabase.

The dashboard shows latest readings and recent historical trends. Heatmap and crisis mode controls are not implemented yet.

## Environment

Use frontend-safe Supabase credentials only:

```text
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

If your Supabase project provides a publishable key instead of an anon key, use:

```text
VITE_SUPABASE_PUBLISHABLE_KEY=your-supabase-publishable-key
```

Never put `SUPABASE_SERVICE_ROLE_KEY` or an `sb_secret` key in dashboard files.

Create the dashboard env file inside `apps/dashboard`:

```powershell
Copy-Item .env.example .env
```

After editing `.env`, restart `npm run dev` or `npm run preview`. Vite only reads env files when the server starts.

## Data Helpers

- `src/lib/supabase.ts` creates the browser Supabase client from `VITE_` env vars.
- `src/api/readings.ts` exports:
  - `fetchLatestReadingsByNode()` for the newest reading per node.
  - `fetchRecentHistoryForNode(nodeId, options)` for recent rows for one node.
  - `createReadingsLoadingState()` for a simple loading state before async calls finish.

`fetchRecentHistoryForNode()` fetches the newest rows first, then returns ascending order by default for chart-friendly history.
The history section uses a lightweight inline SVG chart to plot temperature, humidity, PMV, headcount, and optional air quality for the selected node.

Both helpers return a simple state object:

```ts
{
  status: "success" | "error",
  data: [],
  error: string | null,
  isEmpty: boolean
}
```

## Local Setup

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

For a production-style preview:

```powershell
npm run build
npm run preview
```

For a quick static check:

```powershell
npm run typecheck
```

Open the local Vite URL printed by `npm run dev` or `npm run preview`.

## Supabase RLS

If reads fail with a row-level security error, add a SELECT policy for the frontend anon or publishable role instead of using the service role key in the browser.

Example demo-only policy:

```sql
create policy "Allow public read access for demo"
on public.sensor_readings
for select
to anon
using (true);
```

Use a stricter policy before production.
