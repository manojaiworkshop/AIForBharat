# Chain of Thought (CoT) in LLMs

## What is Chain of Thought?

**Chain of Thought (CoT)** is a prompting technique where you instruct the model to  
**think step by step** before giving a final answer, rather than jumping straight to a conclusion.

It mimics how humans solve hard problems: break it down, reason through each part, then conclude.

---

## Why Does it Matter?

LLMs are next-token predictors. Without CoT, the model compresses all reasoning  
into the final answer token — leading to errors on complex problems.

With CoT, the model "externalizes" its reasoning. Each reasoning step becomes  
context for the next, making the final answer more accurate.

```
Without CoT:  Question → Answer          (reasoning is hidden/skipped)
With CoT:     Question → Step 1 → Step 2 → Step 3 → Answer
```

---

## Types of CoT

### 1. Zero-Shot CoT
Just add `"Think step by step"` to the prompt. No examples needed.

```
Prompt:  "If a store sells 3 units/day and has 45 units in stock, 
          when will it stock out? Think step by step."

Model:   "Step 1: Daily sales rate = 3 units/day
          Step 2: Current stock = 45 units
          Step 3: Days until stockout = 45 / 3 = 15 days
          Answer: The store will stock out in 15 days."
```

### 2. Few-Shot CoT
Provide worked examples in the prompt showing the reasoning pattern.

```
Prompt:  "Example: [question] → [step by step reasoning] → [answer]
          Now solve: [new question]"
```

### 3. Self-Consistency CoT
Run CoT multiple times with temperature > 0, then majority-vote the final answers.  
Useful when you need high reliability.

### 4. Tree of Thoughts (ToT)
Extend CoT to explore multiple reasoning branches in parallel, backtrack if stuck.  
Think of it as a reasoning tree vs a reasoning chain.

---

## CoT in System Prompts (Production Pattern)

In production, CoT is baked into the system prompt:

```
System: "You are a pricing analyst assistant. When answering questions:
         1. First identify the relevant data points
         2. Reason through the implications step by step
         3. Then state your final recommendation clearly
         Always show your reasoning before the answer."
```

---

## CoT vs No CoT — Real Example

**Question:** "SKU-001 has a 30% margin. A competitor dropped their price by 15%.  
Should we match the price? Our margin floor is 20%."

### Without CoT:
```
Answer: "Yes, match the competitor price."
```
(No reasoning — could be wrong, definitely not auditable)

### With CoT:
```
Step 1: Current margin = 30%. Margin floor = 20%. Buffer = 10%.
Step 2: Competitor dropped price by 15%.
Step 3: If we match, our price drops 15%. 
        Impact on margin depends on cost structure.
        Assume a 15% price drop reduces margin by ~10-12 points (typical for retail).
Step 4: New margin ≈ 30% - 11% = 19%. This is BELOW the 20% floor.
Step 5: Matching the full price drop violates our margin guardrail.

Answer: Do NOT fully match. Maximum safe price reduction is ~8-9% to stay above 
        the 20% margin floor. Recommend partial match + promo bundle instead.
```

The CoT answer is more accurate AND explainable — critical for Mercury Grid.

---

## CoT in Agentic Systems

In multi-agent systems like LangGraph, CoT is used at multiple levels:

```
Supervisor Agent CoT:
  "I have outputs from Demand Agent, Pricing Agent, and Inventory Agent.
   Step 1: Check for conflicts between recommendations.
   Step 2: Rank by expected margin impact.
   Step 3: Apply risk guardrails.
   Step 4: Publish final ranked plan."
```

This makes the supervisor's decision auditable and debuggable.

---

## CoT + Tool Calling Together

The most powerful pattern in modern agents:

```
User: "Should we reorder SKU-042?"

Model (CoT + Tools):
  Thought: "I need current stock levels and demand forecast to answer this."
  Action:  call get_stock_level(sku="SKU-042")
  Result:  {"stock": 12, "reorder_point": 50}

  Thought: "Stock is below reorder point. Let me check lead time."
  Action:  call get_supplier_lead_time(sku="SKU-042")
  Result:  {"lead_time_days": 7}

  Thought: "Stock=12, daily demand will deplete this in ~4 days. 
            Lead time is 7 days. We'll stock out before replenishment arrives."
  
  Answer: "Yes, reorder immediately. Current stock (12 units) will deplete in 
           ~4 days, but supplier lead time is 7 days. Recommend ordering 200 
           units now to cover demand and safety stock."
```

This is the **ReAct pattern** (Reason + Act) — the backbone of modern AI agents.

---

## Key Terms

| Term | Meaning |
|---|---|
| **CoT** | Chain of Thought — step-by-step reasoning before answering |
| **Zero-shot CoT** | "Think step by step" added to prompt, no examples |
| **Few-shot CoT** | Worked examples of reasoning included in prompt |
| **ReAct** | Reasoning + Acting — interleave CoT with tool calls |
| **Self-consistency** | Multiple CoT runs → majority vote on answer |
| **ToT** | Tree of Thoughts — branching reasoning paths |

---

## See Code Example
→ [examples/cot_example.py](examples/cot_example.py)  
→ [examples/combined_example.py](examples/combined_example.py)
