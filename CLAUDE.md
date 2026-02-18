# VoltVriend / Slimm — Project Context

## What It Is

**VoltVriend** (also branded as **Slimm - Smart Dutch Energy Savings**) is a smart energy-saving assistant tailored for the Dutch market. It uses AI to estimate electricity usage from a household profile, verify actual usage by uploading an electricity bill (OCR), and suggest cheaper energy providers via monthly market price comparisons.

The entire UI and all AI prompts are written in **Dutch**.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React 19 + TypeScript (Hooks-based, no class components) |
| Build tool | Vite 6 |
| Styling | Tailwind CSS (utility classes inline in JSX), custom "Inter" font |
| Icons | Lucide React |
| AI | Google Gemini (`@google/genai` v1.41) — model: `gemini-3-flash-preview` |
| Backend / Auth / DB | Supabase (`@supabase/supabase-js` v2.48) — Auth + PostgreSQL + RLS |

---

## Architecture

Single Page Application (SPA) following a serverless pattern:
- **Frontend**: React (ESM modules via Vite)
- **Backend-as-a-Service**: Supabase (Authentication + PostgreSQL + Row Level Security)
- **Intelligence Layer**: Google Gemini API for usage estimation, bill OCR, and market comparison

---

## Project Structure

```
/workspace
├── App.tsx                      # Root component — auth state, view routing
├── index.tsx                    # React entry point
├── index.html                   # HTML shell
├── types.ts                     # TypeScript types & interfaces
├── constants.ts                 # Energy providers, Dutch labels, baseline stats
├── components/
│   ├── Layout.tsx               # Shared page wrapper
│   ├── SignupFlow.tsx           # 4-step onboarding / login flow
│   ├── Dashboard.tsx            # Main dashboard — contract info & savings check
│   └── BillVerification.tsx     # Bill upload + Gemini OCR extraction flow
└── services/
    ├── geminiService.ts         # All Gemini AI calls
    └── supabaseClient.ts        # Supabase client initialisation
```

---

## Key Features

1. **Signup flow (4 steps)**
   - Step 1: Email + password (Supabase auth) or login toggle. Error handling localized here (invalid credentials, weak password).
   - Step 2: Location — zipcode, house number, household size, house type
   - Step 3: Current energy contract — provider + contract type (fixed/flexible/dynamic/unknown)
   - Step 4: Monthly cost + energy behaviour checkboxes (WFH, heat pump, district heating, solar panels)
   - On submit: Gemini estimates kWh usage → profile saved to Supabase via `upsert` (handles race condition with DB trigger)

2. **AI usage estimation** (`estimateKwhUsage`)
   - Sends household profile to Gemini; returns `estimated_kwh_per_month`, `estimated_per_kwh_rate`, `confidence_level`, and Dutch-language reasoning.
   - Maps situational inputs (e.g., Stadsverwarming, Warmtepomp) against Dutch energy baselines.

3. **Bill verification / OCR** (`extractBillData`)
   - User uploads a photo/PDF of their electricity bill (camera permission declared in `metadata.json`).
   - Gemini processes base64 image and extracts: annual/monthly kWh, costs, per-kWh rate, provider name, contract type — as structured JSON.
   - Verified data is saved back to Supabase (`is_verified = true`) and used instead of estimates going forward.

4. **Market price comparison** (`compareMarketPrices`)
   - Compares user's current contract against a set of market prices (currently hardcoded mock data).
   - Gemini returns a SWITCH / STAY / CONSIDER recommendation with savings amount (€) and Dutch reasoning.
   - Rules: only recommend switching if saving > €10/month; factor in €50 switching cost; prefer same contract type.

5. **Dashboard**
   - "Savings Card" with state-based styling: Orange for SWITCH ("Bespaar €X"), Green for STAY ("Beste prijs"), Yellow for CONSIDER ("Actie vereist").
   - Shows current provider, contract type, monthly cost, and estimated/verified kWh.
   - "Nu controleren" triggers a fresh market comparison.
   - "Rekening uploaden" triggers bill verification flow (shown only when `is_verified = false`).

---

## Database Schema (Supabase `profiles` table — `public` schema)

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | References `auth.users` |
| `email` | text | |
| `zipcode` | text | |
| `house_number` | text | |
| `household_size` | enum | `'1' \| '2' \| '3-4' \| '5+'` |
| `house_type` | enum | `'apartment' \| 'townhouse' \| 'single_family' \| 'other'` |
| `current_provider` | text | |
| `current_contract_type` | text | `'fixed' \| 'flexible' \| 'dynamic' \| 'unknown'` |
| `monthly_cost` | numeric | |
| `work_from_home` | boolean | |
| `heat_pump` | boolean | |
| `district_heating` | boolean | |
| `solar_panels` | boolean | |
| `is_verified` | boolean | True after bill upload |
| `estimated_kwh_per_month` | numeric | Set by Gemini |
| `estimated_per_kwh_rate` | numeric | Set by Gemini |
| `stripe_customer_id` | text | Prepared for future payment integration |
| `subscription_status` | text | Prepared for future payment integration |

### Trigger-Based Profile Creation (CRITICAL)

When a user signs up via Supabase Auth, a PostgreSQL trigger **`on_auth_user_created`** automatically inserts a row into `public.profiles`. This prevents RLS violations when the frontend attempts to write profile data immediately after signup.

**Important Supabase SQL editor notes:**
- The `profiles` table must be in the **`public` schema**.
- The `handle_new_user` trigger function must be set to **`SECURITY DEFINER`** so it can bypass RLS during initial row creation.
- The frontend uses `supabase.from('profiles').upsert()` (not `insert`) to safely handle potential race conditions between the trigger and the survey submission.

---

## Dutch Domain Logic

The app is specifically tuned for the Dutch energy market:

- **Salderingsregeling**: Solar panels (`solar_panels = true`) reduce net electricity costs. Gemini accounts for this when estimating kWh (typically −100 to −400 kWh/month depending on installation).
- **Warmtepomp (heat pump)**: Significantly increases electricity usage (+150–300 kWh/month). High electric consumer.
- **Stadsverwarming (district heating)**: Reduces electricity usage for heating — user does not run their own boiler/pump for primary heating.
- **Dutch baseline stats** (from `constants.ts`):
  - Apartment: 180–220 kWh/month
  - Single-family home: 250–300 kWh/month
  - WFH add: +40–60 kWh/month
  - Average rate: €0.45/kWh
- **Providers**: Essent, Engie, Vattenfall, Eneco, Nuon, Zonneplan, GreenChoice, BudgetEnergie, United Consumers, Pure Energie, Gewoon Energie.

---

## Environment & Dev Setup

```bash
npm install
# Set GEMINI_API_KEY in .env.local
npm run dev
```

- Gemini API key: read from `process.env.API_KEY` in `geminiService.ts`
- Supabase URL and anon key are hardcoded in `services/supabaseClient.ts`

---

## Upcoming Milestones

1. **Payment integration**: Stripe Elements for a premium "Auto-Switch" or "Monitoring" subscription. Schema columns `stripe_customer_id` and `subscription_status` are already in the `profiles` table.
2. **Real market data**: Replace hardcoded mock prices in `compareMarketPrices` with a live API feed.
3. **Dutch grounding**: Use Gemini's `googleSearch` tool to fetch current provider-specific rates in real time.

---

## Known Incomplete Features

- Market prices in `compareMarketPrices` are **hardcoded mock data** — placeholder for a real pricing API.
- The "Mijn account verwijderen" (delete account) button in the Dashboard has no handler yet.
- The feedback dropdown ("Help ons verbeteren") in the Dashboard has no submit handler yet.
- All AI prompts instruct Gemini to return reasoning in Dutch.
