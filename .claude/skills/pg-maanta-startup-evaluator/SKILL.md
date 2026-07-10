---
name: pg-maanta-startup-evaluator
description: Evaluate MAANTA (or any startup idea) the way Paul Graham would screen a YC application. Use when the user asks for a PG-style evaluation, startup screening, idea stress-test, or invokes /pg-maanta-startup-evaluator. Output always follows Core Assumption -> Three Fatal Flaws -> Problem Validation -> Founder-Market Fit -> Brutal Verdict.
---

# PG / MAANTA Startup Evaluator

Evaluate MAANTA (or any future idea) the way Paul Graham would screen a YC application:

- Find the **one core assumption** the whole business rests on.
- Surface the **3 most likely ways it dies**, specific to this idea.
- Test if the **problem is real and paid for**, not invented.
- Check **founder–market fit**.
- Give a **brutally binary verdict**: strong, weak, or pivot required.

All outputs follow this format:

> Core Assumption -> Three Fatal Flaws -> Problem Validation -> Founder-Market Fit -> Brutal Verdict

## Inputs

The skill expects a short structured description.

**Required fields:**

- `idea`: 3–6 sentences describing what the startup does in plain language.
- `who_for`: the specific type of user or customer.
- `problem`: what they struggle with today.
- `money`: how you plan to make money (pricing / model).
- `stage`: idea only / prototype / some users / revenue.
- `founder_context`: why you (background, skills, access, geography).

If the user invokes the skill without these fields, fill them from conversation and repo context where possible (for MAANTA, use the defaults below); ask only for fields you genuinely cannot infer.

Example for MAANTA:

- `idea`: "MAANTA is a mobile-first mall discovery and redemption platform for Nairobi. Shoppers see live, time-limited in-mall deals, claim a 'ticket', and redeem in store. Merchants pay per redemption instead of a commission-heavy delivery fee."
- `who_for`: "Owner-operators and shop managers in BBS Mall (electronics and fashion first)."
- `problem`: "They have unpredictable foot traffic and dead hours, and no measurable, low-friction way to turn nearby people into paying customers today."
- `money`: "KES 30 per redemption success fee, with optional boosted placement and subscription tiers later."
- `stage`: "Backend wired and migrations shipped, launch docs and handoff pack done, first BBS node pending live test."
- `founder_context`: "Technical founder, CEO, building MAANTA from Norway with intent to relocate to BBS for months, already deep into ops, pricing, and mall partnership design."

## Skill Logic

### 1. Identify the core assumption

Extract a **single sentence** of the form:

> "If X happens consistently for Y type of customer, then this business works."

For MAANTA:

> "If BBS merchants run time-limited MAANTA deals and enough nearby shoppers change behaviour to claim and redeem them regularly, those merchants will pay per redemption and MAANTA becomes a defensible foot-traffic engine."

Constraints:

- Only **one** assumption.
- It must be **testable in weeks**, not years.
- If it's wrong, the **entire business model changes**, not just a feature.

### 2. Find the three most likely fatal flaws (ranked)

List **three specific failure modes**, ordered by how lethal they are. Each must be about **this idea**, not generic startup advice.

For MAANTA, the pattern is:

1. **No repeatable shopper habit**
   - Shoppers don't think to check MAANTA before or during a mall visit.
   - Outcome: claims and redemptions stay too low to matter.

2. **Merchant economics don't clear**
   - Real merchants at BBS don't see enough incremental profit per redemption and churn once promos end.
   - Outcome: MAANTA is filed as "another promo channel that didn't really move the needle."

3. **Operational complexity at node 0 is too high**
   - The model requires too much founder/agent effort per merchant and per node to be profitable.
   - Outcome: node 0 never stabilizes into a low-touch operating rhythm, so you can't scale.

Rules:

- Every flaw must be tied to **behaviour** (what people do), not technology.
- Each entry should read like: "This dies if X never happens / Y always happens."

### 3. Problem Validation

Answer: "Is this a hair-on-fire, weekly pain people would pay to fix, or a nice-to-have?"

For MAANTA, apply this lens:

- Merchants:
  - Weekly / daily pain: dead hours, rent pressure, inconsistent traffic.
  - Evidence: already trying WhatsApp blasts, IG promos, in-store signage, mall promos.
  - Question: do they see MAANTA as **fundamentally different** from these hacks?

- Shoppers:
  - Pain: lack of visibility into "best deals right now" in the mall.
  - Question: does MAANTA actually change which shops they visit and how much they spend?

Output structure:

- `pain_level_merchant`: hair-on-fire / strong / medium / weak.
- `pain_level_user`: hair-on-fire / strong / medium / weak.
- `existing_workarounds`: what they do today and where it fails.
- `willingness_to_pay_hint`: 1–2 sentences on how they talk about value ("this would cover rent", "I'd pay if…" vs. "nice if it were free").

### 4. Founder–Market Fit

Check three axes:

1. **Skill fit** – can this founder realistically build and operate the thing?
2. **Access fit** – do they have direct access to the people and context?
3. **Drive fit** – does this problem clearly bother them enough to grind on it?

For MAANTA's founder:

- Strong skill fit: technical, product, ops.
- Strong drive fit: already deep in docs, pricing, mall ops, and agent design.
- Access fit: contingent on actually relocating and living inside BBS, not remote-only.

Output:

- `fit_score`: strong / moderate / weak.
- `fit_notes`: short bullets for each axis.
- `red_flag`: the one biggest risk on founder–market fit (e.g., unwillingness to live in mall context).

### 5. Brutal Verdict

Answer two questions bluntly:

1. **Would a Paul Graham–style investor likely fund this *in its current form*?**
2. Is the idea **strong**, **weak**, or is a **pivot required**?

Rules:

- No "it has potential but…" hedging.
- If the core assumption is still untested, default to **"pivot required (wedge pivot)"**: you keep the domain but change the first test.
- Tie the verdict directly to the fatal flaws and current stage.

For MAANTA:

- Verdict template:

  > "Verdict: Pivot required (wedge). The category (hyperlocal mall foot-traffic) is strong, but until you prove merchants at BBS actually run deals and see paid-worthy redemptions, this is still a beautifully thought-out deck, not a proven loop."

## Output Format (for every run)

When you invoke the skill, the response must be in this exact structure:

1. **Core Assumption**
   - One sentence, testable, load-bearing.

2. **Three Fatal Flaws** (ranked)
   - 1. [Most dangerous]
   - 2. [Second]
   - 3. [Third]

3. **Problem Validation**
   - Merchant pain level + evidence.
   - User pain level + evidence.
   - Existing workarounds.
   - Early willingness-to-pay signals.

4. **Founder–Market Fit**
   - Fit score (strong / moderate / weak).
   - Notes on skills, access, drive.
   - One explicit red flag, if any.

5. **Brutal Verdict**
   - Strong / Weak / Pivot required.
   - One or two sentences on what must be proven or changed **next**.

## How to use this skill on MAANTA specifically

When running this evaluator on MAANTA:

- Lock in the core assumption as:
  "A dense cluster of BBS merchants will keep paying per redemption if MAANTA repeatedly drives incremental, trackable in-store sales in their dead hours."

- Use the 100-merchant, 30-day, KES 300 promo and BBS launch plan as the **live experiment** to confirm or break that.
- Re-run the skill after the BBS experiment; if the main flaw (no habit, weak merchant economics, or ops heaviness) is still unresolved, the verdict stays "pivot required" and that pivot has to hit the specific flaw, not the cosmetics.
