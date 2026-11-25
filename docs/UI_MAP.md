# English Teaching Tool — UI Map

As of Nov 25, 2026.

## All pages at a glance

The app has 13 pages. Signed-out visitors only see the Landing page; after sign-in, `/` becomes the Home dashboard and every other page opens from the left rail, the bottom bar, the Command Palette (Ctrl K) or a Home card. Any learner page opened while signed out sends you back to `/`.

| # | Page | Address | In plain words | How you get there |
| --- | --- | --- | --- | --- |
| 1 | Landing | `/` (signed out) | The welcome page with the sign-in card | Open the site |
| 2 | Home | `/` (signed in) | Your dashboard: XP, streak, level, scores, settings | Sign in; logo; rail; bottom bar |
| 3 | Role-play | `/roleplay` | Speak with an AI partner in a job interview or café | Rail, bottom bar, Home hero and card |
| 4 | Interview | `/interview` | Upload your resume, get interviewed on it | Rail, Home card |
| 5 | Mistake Coach | `/coach` | Hands-free talk about your recent mistakes | Rail, Home card |
| 6 | JAM | `/jam` | Speak for one minute on today's topic | Rail, bottom bar, Home hero and card |
| 7 | Daily Word | `/daily-word` | Guess the five-letter word, then use it in a sentence | Rail, bottom bar, Home card |
| 8 | Word Chain | `/word-chain` | Say a word starting with the AI's last letter | Rail, Home card |
| 9 | Tongue Twister | `/tongue-twister` | Listen once, then say it clearly and fast | Rail, Home card |
| 10 | MCQ Quiz | `/quiz` | Ten grammar and vocabulary questions | Rail, Home card, Coach page |
| 11 | Placement Test | `/placement` | Answer three questions out loud to get your level | Home hero, Level card, Home card, palette |
| 12 | Plans | `/plans` | Buy more interviews and speaking time | Rail, Home card, Interview (when none left) |
| 13 | Admin | `/admin` | Staff page for users, plans and payments | Type the address (separate password) |

Every activity page ends on a result screen with a **Home** button, and most have a **Practise again** or **Try again** button that restarts the same activity.

## How the pages connect

```
 Landing (/ signed out) --sign in--> Tell us about you --submit--> Home dashboard (/ signed in)
        |                            (first sign-in only)               ^        |
        +------------- returning users go straight to Home -------------+        |
                                                                                  v
 +------------------ Signed-in pages: rail, bottom bar, Ctrl K palette, Home cards ------------------+
 |  Talk with AI          Speaking games          Tests and plans                                    |
 |  - Role-play           - JAM                   - MCQ Quiz                                         |
 |  - Interview           - Daily Word            - Placement Test                                   |
 |  - Mistake Coach       - Word Chain            - Plans                                            |
 |                        - Tongue Twister                                                           |
 +-------------------------------- result screens: back to Home ------------------------------------+

 Admin (/admin) — staff only: its own password, not linked from any page
```

In simple words: you land on the welcome page and sign in. The first time only, you fill in a short profile. After that, `/` is your Home dashboard, and every practice page opens from the menu or a Home card. Each activity ends on a result screen whose Home button brings you back. Two pages also link sideways: Interview sends you to Plans when you have no interviews left, and the Placement Test result offers a Role-play. A signed-out visitor who opens any learner page is sent back to the Landing page.

## Shared layout (on every page)

Every page sits inside one Shell. What the Shell shows depends on whether you are signed in. Source: `components/Shell.tsx`, `components/Nav.tsx`, `components/CommandPalette.tsx`.

### Signed out: top bar

| Element | What it does / calls |
| --- | --- |
| Mic logo + "English Coach" | Link to `/` (landing page) |
| Features, Feedback, Games, How it works | Scroll links to `/#features`, `/#feedback`, `/#games`, `/#how` on the landing page |
| Day / Night button | `toggleTheme()` (saved in the browser) |
| Sign in, Get started | Scroll to the sign-in card at `/#signin` |

### Signed in: left rail (desktop, 1024px and wider)

| Element | What it does / calls |
| --- | --- |
| Mic logo | Link to `/` (Home dashboard) |
| Page icons | One link per page marked `rail` in `navItems.ts`: Home, Role-play, Mistake Coach, Interview, JAM, Daily Word, Word Chain, Tongue Twister, MCQ Quiz, Plans |
| Search (Ctrl K) | Opens the Command Palette |
| Day / Night | `toggleTheme()` |
| Sign out | `signOut()` → Supabase sign-out, returns to the landing page |
| XP and streak pills (top right, not on Home) | `GET /v1/me`, re-fetched on every page change |

### Signed in: phone and tablet

| Element | What it does / calls |
| --- | --- |
| Top bar: logo, XP and streak pills, theme button | Same as the rail: `/`, `GET /v1/me`, `toggleTheme()` |
| Bottom bar | Links to Home, Role-play, JAM, Daily Word (pages marked `bar`) |
| More | Opens the Command Palette |

### Command Palette (Ctrl K or Cmd K)

| Element | What it does / calls |
| --- | --- |
| Search box | Filters pages and actions by name or hint |
| Go to list | Every page in `navItems.ts`, including Placement Test; keys 1–9 jump straight there |
| Actions | Switch day/night mode, Sign out |

The palette, rail and bottom bar all read one list, `NAV` in `navItems.ts`, so a page added there appears in all three.

## Page by page

Each page lists its screens (most pages change screen as you go) and every element that does something. "Calls" is the backend endpoint, or the browser function, the element triggers. All endpoints send the signed-in user's token.

### 1. Landing page — `/` (signed out)

Source: `components/landing/Landing.tsx`, `components/Auth.tsx` (`SignIn`).

| Element | Calls |
| --- | --- |
| Start speaking free | Scrolls to `#signin` |
| See what's inside | Scrolls to `#features` |
| Features carousel: Previous / Next arrows | Slides the cards (no backend call) |
| Games tiles | Scroll to `#signin` |
| Sign-in card: Continue with Google | Supabase `signInWithOAuth` (Google), returns to `/` |
| Sign-in card: Email + Password + Sign in | Supabase `signInWithPassword` |
| New here? Create an account → Create account | Supabase `signUp` (sends a confirm email) |
| Forgot password? → Send reset link | Supabase `resetPasswordForEmail` |
| Footer links | Scroll to Features, Games, How it works, Sign in |

Two extra screens can appear at `/`:

- **Tell us about you** (first sign-in only, when `GET /v1/me` answers 428): name, mobile number, birth year, parental-consent tick box (under 18 only), explanation language. **Start learning** → `POST /v1/auth/profile`, then the Home dashboard loads.
- **Choose a new password** (after a reset-email link): **Save password** → Supabase `updateUser`.

### 2. Home dashboard — `/` (signed in)

Source: `app/page.tsx`. Loads with `GET /v1/me` (user, recent activity, mistakes, best scores, speaking time).

| Element | Calls |
| --- | --- |
| Greeting "Hi \<name>!" + streak line | Data from `GET /v1/me` |
| Hero: Start a role-play / Today's JAM | Links to `/roleplay`, `/jam` (shown once a level is set) |
| Hero: Find your level | Link to `/placement` (shown when no level yet) |
| "min speaking left" pill, Speaking today card | Data from `GET /v1/me` |
| Total XP, Day streak, Level cards | Data from `GET /v1/me`; Level card links to `/placement` when empty |
| Practise grid (10 cards) | Links to Role-play, Mistake Coach, JAM, Daily Word, Word Chain, Tongue Twister, MCQ Quiz, Placement Test, Interview, Plans |
| Best scores chart | Data from `GET /v1/me` |
| Recent activity list (last 6) | Data from `GET /v1/me` |
| Mistakes to review | Data from `GET /v1/me` (only when there are mistakes) |
| Settings: Explanations in (English / Hinglish) | `PATCH /v1/me` with `explain_lang` |
| Settings: Appearance (Day / Night) | `setTheme()` (browser only) |
| Sign out | `signOut()` |
| Delete account | Confirm box → `DELETE /v1/me` → sign out |

### 3. Role-play — `/roleplay`

Source: `components/Conversation.tsx` (mode `roleplay`). Signed-out visitors are sent to `/`.

| Screen | Element | Calls |
| --- | --- | --- |
| Choose a situation | Job Interview card, Everyday Conversation card | `POST /v1/roleplay` with the scenario; AI's first line plays aloud |
| Conversation | Chat bubbles + speaker button on AI lines | `playAudio()` replays the line |
| Conversation | "turns left" chip | From the last reply |
| Conversation | Mic button: Tap to speak / Tap to send (30 s max) | `POST /v1/roleplay/{id}/turn` with the WAV recording |
| Conversation | Finish & get feedback | `POST /v1/roleplay/{id}/finish` |
| Feedback | Score ring, summary, XP, Mistakes, Sound more natural | Data from the finish call |
| Feedback | Practise again / Home | Back to Choose a situation / link to `/` |

### 4. Interview — `/interview`

Source: `components/Conversation.tsx` (mode `interview`). Same chat and feedback screens as Role-play.

| Screen | Element | Calls |
| --- | --- | --- |
| Start | Plan note ("N interviews left") | `GET /v1/me` |
| Start | Upload your resume (PDF, up to 2 MB) | `POST /v1/roleplay/resume` with the file |
| Start | See plans (when no interviews left) | Link to `/plans` |
| Conversation | Mic button, Finish & get feedback | Same as Role-play: `/v1/roleplay/{id}/turn`, `/v1/roleplay/{id}/finish` |
| Feedback | Interview readiness ring, Strengths, Areas to work on, English mistakes | Data from the finish call |

### 5. Mistake Coach — `/coach`

Source: `app/coach/page.tsx`, `lib/useHandsFree.ts`. Hands-free: the mic opens by itself after the coach speaks and sends when you stop talking.

| Screen | Element | Calls |
| --- | --- | --- |
| Start | Recent mistakes list (up to 3), default language | `GET /v1/me` |
| Start | Explain in: English / Hinglish | Local choice, sent with Start |
| Start | Role-play / JAM / quiz links (when no mistakes yet) | Links to `/roleplay`, `/jam`, `/quiz` |
| Start | Start coaching | `POST /v1/coach` with `language` |
| Session | Mic button (auto-listen, or tap to send now) | `POST /v1/coach/{id}/turn` with the WAV |
| Session | Speaker button on coach lines | `playAudio()` |
| Session | Pause hands-free | Stops the auto-listen mic |
| Session | Finish & get recap | `POST /v1/coach/{id}/finish`; recap plays aloud |
| Recap | Summary, XP, play-again button, New things to work on | Data from the finish call |
| Recap | Practise again | Back to Start, re-fetches `GET /v1/me` |

### 6. JAM (Just a Minute) — `/jam`

Source: `app/jam/page.tsx`.

| Screen | Element | Calls |
| --- | --- | --- |
| Ready | Today's topic, think/speak seconds | `GET /v1/jam/topic` |
| Ready | Start | Think countdown, then the mic opens for the speak countdown |
| Speaking | Stop early | Stops recording and submits |
| Scoring → Result | (automatic) | `POST /v1/jam` with the WAV |
| Result | Score ring, feedback, words per minute, fillers, pauses, repeats, score grid, mistakes, transcript | Data from `POST /v1/jam` |
| Result | Try again / Home | Restarts the countdown / link to `/` |

### 7. Daily Word — `/daily-word`

Source: `app/daily-word/page.tsx`. Guess a five-letter word in six tries; one word per day for everyone.

| Screen | Element | Calls |
| --- | --- | --- |
| Game | Guess grid (6 rows), tries left | `GET /v1/daily-word` (today's state, past guesses) |
| Game | Guess box + Guess button (enabled at 5 letters) | `POST /v1/daily-word/guess` with `word` |
| Reveal | Word, meaning, example, Hear the word | `playAudio()` |
| Reveal | Share on WhatsApp | Copies the emoji grid to the clipboard, opens `wa.me` |
| Bonus | Mic: "Tap and say your sentence" (15 s) | `POST /v1/daily-word/sentence` with the WAV |
| Bonus | Result note (+XP or feedback, "We heard") | Data from the sentence call |

### 8. Word Chain — `/word-chain`

Source: `app/word-chain/page.tsx`. Say a word that starts with the last letter of the AI's word.

| Screen | Element | Calls |
| --- | --- | --- |
| Rules | Start | `POST /v1/word-chain` (new game, AI's first word) |
| Game | Chain of word chips, last word + Hear again | `playAudio()` |
| Game | 15-second countdown ring | Runs out → `POST /v1/word-chain/{id}/stop` |
| Game | Mic: "Tap and say your word" | `POST /v1/word-chain/{id}/turn` with the WAV |
| Game | End game | `POST /v1/word-chain/{id}/stop` |
| Game over | "You beat the AI!" / "Game over", score | Data from the last call |
| Game over | Play again / Home | `POST /v1/word-chain` / link to `/` |

### 9. Tongue Twister — `/tongue-twister`

Source: `app/tongue-twister/page.tsx`.

| Element | Calls |
| --- | --- |
| Twister text, level, target seconds | `GET /v1/tongue-twister/{level}` |
| Level dropdown | Loads a twister for that level (`GET /v1/tongue-twister/{level}`) |
| Listen once (plays one time only) | `playAudio()` |
| New twister | Re-fetches `GET /v1/tongue-twister/{level}` |
| Mic: "Tap and say the twister" | `POST /v1/tongue-twister/{level}` with the WAV and `twister_id` |
| Result: "Nicely done!" / "Almost!", We heard | Data from the scoring call |
| Next level (after a pass) / Try again | Loads the next level / clears the result |

### 10. MCQ Quiz — `/quiz`

Source: `app/quiz/page.tsx`. Ten grammar and vocabulary questions.

| Screen | Element | Calls |
| --- | --- | --- |
| Start | Start | `POST /v1/quiz` (new quiz) |
| Question | Answer option buttons | Saves the choice locally |
| Question | Back / Next | Moves between questions |
| Question | Submit (last question, all answered) | `POST /v1/quiz/{id}` with `answers` |
| Result | "N of 10 correct", per-question review, mistakes | Data from the submit call |
| Result | New quiz / Home | `POST /v1/quiz` / link to `/` |

### 11. Placement Test — `/placement`

Source: `app/placement/page.tsx`. Not on the rail; reached from Home or the Command Palette.

| Screen | Element | Calls |
| --- | --- | --- |
| Questions | Step tracker, question text, time limit | `GET /v1/placement` |
| Questions | Mic: "Tap and answer" (one recording per question) | Kept in the browser until the end |
| Questions | Redo last step | Drops the last recording |
| All done | See my level | `POST /v1/placement` with `answer_0`, `answer_1`, … WAV files |
| Result | Level badge, scores, What we heard | Data from the submit call |
| Result | Practise a conversation / Back to home | Links to `/roleplay`, `/` |

### 12. Plans — `/plans`

Source: `app/plans/page.tsx`. Payments go through Razorpay's checkout window.

| Element | Calls |
| --- | --- |
| Your plan card (name, end date, interviews left) | `GET /v1/plans` |
| Start \<next plan> now (when interviews are used up) | `POST /v1/plans/activate-upcoming` |
| Plan cards: price, days, interviews, minutes a day, voice | `GET /v1/plans` |
| Buy for ₹N | `POST /v1/payments/order` → opens Razorpay → `POST /v1/payments/verify` |
| Buy (greyed out) | Blocked until the queued plan has started |

### 13. Admin — `/admin`

Source: `app/admin/page.tsx`. Not linked anywhere in the app; you type the address. Uses its own password and an `X-Admin-Token` header, not the learner sign-in.

| Screen / tab | Element | Calls |
| --- | --- | --- |
| Sign in | Password + Sign in | `POST /v1/admin/login` (token kept in the browser) |
| Header | Users / Plans / Payments tabs | Switch tab; data from the three calls below |
| Header | Sign out | Forgets the admin token |
| Users | Search by name, email or mobile | `GET /v1/admin/users?q=…` |
| Users | Table: name, email, mobile, plan, plan ends, interviews, level, XP, last active, joined | `GET /v1/admin/users` |
| Users | Plan dropdown per user | `POST /v1/admin/users/{id}/plan` with `plan_id` |
| Plans | Table: price, length, interviews, minutes a day, voice, users, status | `GET /v1/admin/plans` |
| Plans | Unlist / Relist (not on the Free plan) | `POST /v1/admin/plans/{id}/listed` |
| Plans | Create a plan form: name, price, days, interviews, minutes a day, natural voice | `POST /v1/admin/plans` |
| Payments | Table: date, user, plan, amount, status, result, Razorpay ids | `GET /v1/admin/payments` |

## API reference: endpoint → page

Every backend route in `apps/api/app`, with the page that calls it. All paths start with `/v1`. The web app reaches them through `api()`, `postJson()` and `postAudio()` in `lib/api.ts`.

| Endpoint | Used by |
| --- | --- |
| `POST /auth/profile` | Landing → Tell us about you |
| `GET /me` | Nav pills (every page), Home, Interview, Mistake Coach |
| `PATCH /me` | Home → Explanations in |
| `DELETE /me` | Home → Delete account |
| `POST /roleplay` | Role-play → scenario cards |
| `POST /roleplay/resume` | Interview → Upload your resume |
| `POST /roleplay/{id}/turn` | Role-play, Interview → mic |
| `POST /roleplay/{id}/finish` | Role-play, Interview → Finish & get feedback |
| `POST /coach` | Mistake Coach → Start coaching |
| `POST /coach/{id}/turn` | Mistake Coach → mic |
| `POST /coach/{id}/finish` | Mistake Coach → Finish & get recap |
| `GET /jam/topic` | JAM → on load |
| `POST /jam` | JAM → end of the speaking minute |
| `GET /daily-word` | Daily Word → on load |
| `POST /daily-word/guess` | Daily Word → Guess |
| `POST /daily-word/sentence` | Daily Word → bonus mic |
| `POST /word-chain` | Word Chain → Start, Play again |
| `POST /word-chain/{id}/turn` | Word Chain → mic |
| `POST /word-chain/{id}/stop` | Word Chain → End game, timer runs out |
| `GET /tongue-twister/{level}` | Tongue Twister → on load, Level, New twister |
| `POST /tongue-twister/{level}` | Tongue Twister → mic |
| `POST /quiz` | MCQ Quiz → Start, New quiz |
| `POST /quiz/{id}` | MCQ Quiz → Submit |
| `GET /placement` | Placement Test → on load |
| `POST /placement` | Placement Test → See my level |
| `GET /plans` | Plans → on load |
| `POST /plans/activate-upcoming` | Plans → Start \<plan> now |
| `POST /payments/order` | Plans → Buy |
| `POST /payments/verify` | Plans → after Razorpay checkout succeeds |
| `POST /admin/login` | Admin → Sign in |
| `GET /admin/users` | Admin → Users tab, search |
| `POST /admin/users/{id}/plan` | Admin → plan dropdown |
| `GET /admin/plans`, `POST /admin/plans` | Admin → Plans tab, Create plan |
| `POST /admin/plans/{id}/listed` | Admin → Unlist / Relist |
| `GET /admin/payments` | Admin → Payments tab |

Three routes have no button in the UI: `GET /roleplay/scenarios` (the scenario list is hard-coded in `Conversation.tsx`), `POST /payments/webhook` (called by Razorpay's servers) and `GET /health` (a server check).
