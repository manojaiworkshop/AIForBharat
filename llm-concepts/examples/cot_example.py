"""
Chain of Thought (CoT) Example — GPT-based model
=================================================
Demonstrates three CoT patterns:
  1. Zero-shot CoT ("think step by step")
  2. Few-shot CoT (worked example in prompt)
  3. Structured CoT via system prompt (production pattern)

Requirements:
    pip install openai

Set your key:
    export OPENAI_API_KEY=sk-...
"""

import os
from openai import OpenAI

client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))


def ask(system_prompt: str, user_message: str, label: str):
    print(f"\n{'='*60}")
    print(f"[{label}]")
    print(f"User: {user_message}")
    print('-'*60)
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system",  "content": system_prompt},
            {"role": "user",    "content": user_message}
        ],
        temperature=0.2
    )
    answer = response.choices[0].message.content
    print(f"Model:\n{answer}")
    return answer


# ── Pattern 1: NO CoT — direct answer ───────────────────────────────────────

ask(
    system_prompt="You are a retail pricing assistant. Answer concisely.",
    user_message=(
        "SKU-001 has a 30% margin. A competitor dropped their price by 15%. "
        "Our margin floor is 20%. Should we match the price?"
    ),
    label="Pattern 1: No CoT — direct answer"
)


# ── Pattern 2: Zero-Shot CoT — "Think step by step" ─────────────────────────

ask(
    system_prompt="You are a retail pricing assistant.",
    user_message=(
        "SKU-001 has a 30% margin. A competitor dropped their price by 15%. "
        "Our margin floor is 20%. Should we match the price? "
        "Think step by step before answering."
    ),
    label="Pattern 2: Zero-Shot CoT"
)


# ── Pattern 3: Few-Shot CoT — worked example in prompt ──────────────────────

few_shot_system = """
You are a retail pricing assistant.
When solving pricing problems, follow this reasoning pattern:

Example:
Q: SKU-X has 25% margin. Competitor cut price by 10%. Floor is 15%.
A:
  Step 1: Current margin = 25%. Floor = 15%. Buffer = 10%.
  Step 2: Competitor dropped price by 10%.
  Step 3: A 10% price drop typically reduces margin by ~7 points.
  Step 4: New estimated margin = 25% - 7% = 18%. This is ABOVE the 15% floor.
  Step 5: Matching is safe. It preserves competitiveness within guardrails.
  Recommendation: Match the competitor price. Monitor margin post-change.

Now apply the same reasoning pattern to the user's question.
"""

ask(
    system_prompt=few_shot_system,
    user_message=(
        "SKU-001 has a 30% margin. A competitor dropped their price by 15%. "
        "Our margin floor is 20%. Should we match the price?"
    ),
    label="Pattern 3: Few-Shot CoT"
)


# ── Pattern 4: Structured CoT system prompt (production pattern) ─────────────

structured_system = """
You are Mercury Grid's Pricing Agent.

When making a recommendation, ALWAYS structure your response as:

ANALYSIS:
  - List the key data points
  - Identify risks and constraints

REASONING:
  - Work through the decision step by step
  - Quantify impact where possible

RECOMMENDATION:
  - State the action clearly
  - Include expected impact (margin, revenue)
  - Flag if human approval is required
"""

ask(
    system_prompt=structured_system,
    user_message=(
        "SKU-001: current price $100, margin 30%, floor 20%. "
        "Competitor dropped to $88 (12% cut). "
        "Our 30-day sales velocity is 200 units/month. "
        "Should we reprice? What's the recommendation?"
    ),
    label="Pattern 4: Structured CoT (Production pattern)"
)


# ── Pattern 5: Self-consistency — run 3 times, compare outputs ──────────────

print(f"\n{'='*60}")
print("[Pattern 5: Self-Consistency — 3 runs, compare answers]")
print('-'*60)

question = (
    "A store sells 50 units/day. Current stock is 300 units. "
    "Reorder lead time is 7 days. Safety stock requirement is 100 units. "
    "When should we place the reorder? Think step by step."
)

answers = []
for i in range(3):
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": "You are an inventory planning assistant."},
            {"role": "user",   "content": question}
        ],
        temperature=0.7  # higher temp = more variation between runs
    )
    answer = response.choices[0].message.content
    answers.append(answer)
    print(f"\nRun {i+1}:\n{answer}\n{'-'*40}")

print("\n[Self-consistency check: compare the final numeric answers above.]")
print("[If all 3 agree → high confidence. If they differ → lower confidence.]")
