"""
Tool Calling Example — GPT-based model
=======================================
Demonstrates how the model decides to call a function,
how you execute it, and how you return the result.

Requirements:
    pip install openai

Set your key:
    export OPENAI_API_KEY=sk-...
"""

import json
import os
from openai import OpenAI

client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

# ── Step 1: Define your tools (functions the model can call) ────────────────

tools = [
    {
        "type": "function",
        "function": {
            "name": "get_weather",
            "description": "Get the current weather for a given city. "
                           "Use this when the user asks about weather or temperature.",
            "parameters": {
                "type": "object",
                "properties": {
                    "city": {
                        "type": "string",
                        "description": "The city name, e.g. 'Mumbai' or 'New York'"
                    },
                    "unit": {
                        "type": "string",
                        "enum": ["celsius", "fahrenheit"],
                        "description": "Temperature unit. Default to celsius."
                    }
                },
                "required": ["city"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_stock_price",
            "description": "Get the current stock price for a given ticker symbol.",
            "parameters": {
                "type": "object",
                "properties": {
                    "ticker": {
                        "type": "string",
                        "description": "Stock ticker symbol, e.g. 'AAPL', 'TSLA'"
                    }
                },
                "required": ["ticker"]
            }
        }
    }
]


# ── Step 2: Implement the actual functions (your real code lives here) ──────

def get_weather(city: str, unit: str = "celsius") -> dict:
    """
    In production: call a real weather API.
    Here we return mock data.
    """
    mock_data = {
        "Mumbai":   {"temperature": 32, "condition": "Sunny",  "humidity": "78%"},
        "New York": {"temperature": 8,  "condition": "Cloudy", "humidity": "55%"},
        "London":   {"temperature": 5,  "condition": "Rainy",  "humidity": "85%"},
    }
    data = mock_data.get(city, {"temperature": 20, "condition": "Unknown", "humidity": "N/A"})
    return {"city": city, "unit": unit, **data}


def get_stock_price(ticker: str) -> dict:
    """
    In production: call Yahoo Finance / Alpha Vantage API.
    Here we return mock data.
    """
    mock_prices = {
        "AAPL": 189.50,
        "TSLA": 248.30,
        "GOOGL": 175.20,
    }
    price = mock_prices.get(ticker.upper(), None)
    if price:
        return {"ticker": ticker.upper(), "price": price, "currency": "USD"}
    return {"ticker": ticker, "error": "Ticker not found"}


# ── Step 3: Route function calls to actual functions ────────────────────────

def execute_tool_call(tool_name: str, tool_args: dict) -> str:
    """Dispatch the tool call to the right function and return result as JSON string."""
    if tool_name == "get_weather":
        result = get_weather(**tool_args)
    elif tool_name == "get_stock_price":
        result = get_stock_price(**tool_args)
    else:
        result = {"error": f"Unknown tool: {tool_name}"}
    return json.dumps(result)


# ── Step 4: The main agent loop ─────────────────────────────────────────────

def run_agent(user_message: str):
    print(f"\n{'='*60}")
    print(f"User: {user_message}")
    print('='*60)

    messages = [
        {"role": "user", "content": user_message}
    ]

    # First call — model decides whether to use a tool
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=messages,
        tools=tools,
        tool_choice="auto"   # let model decide: call tool or answer directly
    )

    assistant_message = response.choices[0].message

    # Check if model wants to call a tool
    if assistant_message.tool_calls:
        print(f"\n[Model decided to call {len(assistant_message.tool_calls)} tool(s)]")

        # Add assistant's tool_call message to history
        messages.append(assistant_message)

        # Execute each tool call
        for tool_call in assistant_message.tool_calls:
            fn_name = tool_call.function.name
            fn_args = json.loads(tool_call.function.arguments)

            print(f"\n  → Calling: {fn_name}({fn_args})")
            result = execute_tool_call(fn_name, fn_args)
            print(f"  ← Result:  {result}")

            # Append tool result to history
            messages.append({
                "role": "tool",
                "tool_call_id": tool_call.id,
                "content": result
            })

        # Second call — model reads tool results and generates final answer
        final_response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            tools=tools
        )
        final_answer = final_response.choices[0].message.content

    else:
        # Model answered directly without calling any tool
        print("\n[Model answered directly — no tool call needed]")
        final_answer = assistant_message.content

    print(f"\nAssistant: {final_answer}")
    return final_answer


# ── Run examples ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    # Example 1: Weather question → should trigger get_weather tool
    run_agent("What's the weather like in Mumbai right now?")

    # Example 2: Stock question → should trigger get_stock_price tool
    run_agent("What is Apple's current stock price?")

    # Example 3: Multiple tools in one turn
    run_agent("Tell me the weather in London and the current price of Tesla stock.")

    # Example 4: No tool needed — model answers from its own knowledge
    run_agent("What is the capital of France?")
