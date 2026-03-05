"""
Combined Example — Tool Calling + Chain of Thought (ReAct Pattern)
===================================================================
This is the ReAct pattern: Reason + Act
  - Model REASONS about what it needs (CoT)
  - Model ACTS by calling tools
  - Model REASONS again with the results
  - Repeat until final answer

This is exactly how Mercury Grid's agents work under the hood.

Requirements:
    pip install openai

Set your key:
    export OPENAI_API_KEY=sk-...
"""

import json
import os
from openai import OpenAI

client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

# ── Tool definitions (Mercury Grid style) ───────────────────────────────────

tools = [
    {
        "type": "function",
        "function": {
            "name": "get_sku_stock",
            "description": "Get current stock level and reorder point for a SKU.",
            "parameters": {
                "type": "object",
                "properties": {
                    "sku_id": {"type": "string", "description": "SKU identifier e.g. 'SKU-042'"}
                },
                "required": ["sku_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_demand_forecast",
            "description": "Get the 7-day and 30-day demand forecast for a SKU.",
            "parameters": {
                "type": "object",
                "properties": {
                    "sku_id": {"type": "string", "description": "SKU identifier"}
                },
                "required": ["sku_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_competitor_price",
            "description": "Get the latest competitor price for a SKU.",
            "parameters": {
                "type": "object",
                "properties": {
                    "sku_id": {"type": "string", "description": "SKU identifier"}
                },
                "required": ["sku_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_sku_pricing",
            "description": "Get the current price and margin details for a SKU.",
            "parameters": {
                "type": "object",
                "properties": {
                    "sku_id": {"type": "string", "description": "SKU identifier"}
                },
                "required": ["sku_id"]
            }
        }
    }
]


# ── Mock data layer (replace with real DB/API calls in production) ───────────

def get_sku_stock(sku_id: str) -> dict:
    mock = {
        "SKU-042": {"stock": 45, "reorder_point": 100, "lead_time_days": 5},
        "SKU-001": {"stock": 300, "reorder_point": 50,  "lead_time_days": 3},
    }
    return mock.get(sku_id, {"error": "SKU not found"})


def get_demand_forecast(sku_id: str) -> dict:
    mock = {
        "SKU-042": {"daily_avg": 18, "forecast_7d": 126, "forecast_30d": 540, "trend": "rising"},
        "SKU-001": {"daily_avg": 5,  "forecast_7d": 35,  "forecast_30d": 150, "trend": "stable"},
    }
    return mock.get(sku_id, {"error": "SKU not found"})


def get_competitor_price(sku_id: str) -> dict:
    mock = {
        "SKU-042": {"competitor": "RivalStore", "price": 42.99, "our_price": 49.99, "delta_pct": -14.0},
        "SKU-001": {"competitor": "RivalStore", "price": 95.00, "our_price": 100.00, "delta_pct": -5.0},
    }
    return mock.get(sku_id, {"error": "SKU not found"})


def get_sku_pricing(sku_id: str) -> dict:
    mock = {
        "SKU-042": {"price": 49.99, "cost": 30.00, "margin_pct": 40.0, "margin_floor_pct": 20.0},
        "SKU-001": {"price": 100.00, "cost": 70.00, "margin_pct": 30.0, "margin_floor_pct": 20.0},
    }
    return mock.get(sku_id, {"error": "SKU not found"})


def execute_tool(name: str, args: dict) -> str:
    dispatch = {
        "get_sku_stock":        get_sku_stock,
        "get_demand_forecast":  get_demand_forecast,
        "get_competitor_price": get_competitor_price,
        "get_sku_pricing":      get_sku_pricing,
    }
    fn = dispatch.get(name)
    result = fn(**args) if fn else {"error": f"Unknown tool: {name}"}
    return json.dumps(result)


# ── ReAct Agent (CoT + Tool Calling) ────────────────────────────────────────

SYSTEM_PROMPT = """
You are Mercury Grid's Supervisor Agent — an expert in retail pricing and inventory decisions.

When analyzing a SKU, ALWAYS:
1. THINK about what data you need before calling any tools
2. Call the necessary tools to gather real data
3. REASON through the data step by step:
   - Check stock levels vs forecast demand
   - Check competitor pricing vs our margin constraints
   - Identify risks (stockout, margin breach, lost sales)
4. STATE a clear, ranked recommendation with expected impact

Be explicit about your reasoning at each step. 
Flag any action that requires human approval (high risk or low confidence).
"""


def react_agent(user_query: str, max_turns: int = 6):
    """
    ReAct loop: continue calling tools until the model stops requesting them.
    """
    print(f"\n{'='*65}")
    print(f"QUERY: {user_query}")
    print('='*65)

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user",   "content": user_query}
    ]

    for turn in range(max_turns):
        print(f"\n--- Turn {turn + 1} ---")

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            tools=tools,
            tool_choice="auto"
        )

        msg = response.choices[0].message

        if msg.tool_calls:
            # Model wants to call tools — execute them all
            print(f"[Calling {len(msg.tool_calls)} tool(s)...]")
            messages.append(msg)

            for tc in msg.tool_calls:
                name = tc.function.name
                args = json.loads(tc.function.arguments)
                print(f"  → {name}({args})")
                result = execute_tool(name, args)
                print(f"  ← {result}")

                messages.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": result
                })

        else:
            # Model is done with tools — this is the final CoT reasoning + answer
            print(f"\nFINAL RECOMMENDATION:\n{msg.content}")
            return msg.content

    print("\n[Max turns reached]")
    return None


# ── Run Mercury Grid scenarios ───────────────────────────────────────────────

if __name__ == "__main__":

    # Scenario 1: Inventory decision with demand context
    react_agent(
        "Should we reorder SKU-042? Give me a full analysis and recommendation."
    )

    # Scenario 2: Pricing decision with competitor pressure
    react_agent(
        "A competitor just dropped their price on SKU-042 significantly. "
        "Should we reprice? Consider our margin constraints."
    )

    # Scenario 3: Full SKU review (both inventory + pricing)
    react_agent(
        "Give me a complete decision brief for SKU-042: "
        "inventory status, pricing position, and recommended actions."
    )
