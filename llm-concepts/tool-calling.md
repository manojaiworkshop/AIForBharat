# Tool Calling in GPT-Based Models

## What is Tool Calling?

Tool calling (also called **function calling**) is the ability of an LLM to:
1. Recognize that it needs external data or an action to answer a question
2. Generate a structured JSON call to a defined function/tool
3. Receive the result back and incorporate it into its final answer

The model itself **does not execute** the function — your code does.  
The model only decides **when to call it** and **what arguments to pass**.

---

## How it Works — Step by Step

```
User Prompt
    ↓
Model reads available tools (as JSON schema in the system prompt)
    ↓
Model decides: "I need to call tool X with args {}"
    ↓
Model outputs a structured tool_call (JSON), NOT a text answer
    ↓
Your code intercepts this, runs the actual function
    ↓
You send the function result back to the model
    ↓
Model reads the result and produces the final natural language answer
```

---

## Why Does This Exist?

LLMs have a **knowledge cutoff** and live entirely in text.  
They cannot:
- Check live stock prices
- Query your database
- Send emails
- Read files

Tool calling bridges this gap. The model acts as an **intelligent router** —  
it knows what it needs but relies on your code to fetch/execute it.

---

## Anatomy of a Tool Definition

You define tools as JSON schema and pass them in the API call:

```json
{
  "type": "function",
  "function": {
    "name": "get_weather",
    "description": "Get the current weather for a given city",
    "parameters": {
      "type": "object",
      "properties": {
        "city": {
          "type": "string",
          "description": "The city name, e.g. 'Mumbai'"
        },
        "unit": {
          "type": "string",
          "enum": ["celsius", "fahrenheit"]
        }
      },
      "required": ["city"]
    }
  }
}
```

The model reads the `name` and `description` to understand what the tool does.  
The `parameters` schema tells it what arguments to produce.

---

## What the Model Returns (Tool Call Response)

When the model decides to call a tool, it returns this instead of plain text:

```json
{
  "role": "assistant",
  "content": null,
  "tool_calls": [
    {
      "id": "call_abc123",
      "type": "function",
      "function": {
        "name": "get_weather",
        "arguments": "{\"city\": \"Mumbai\", \"unit\": \"celsius\"}"
      }
    }
  ]
}
```

Note: `content` is `null` — the model is NOT giving a text answer yet.  
It is waiting for you to run the function and return the result.

---

## Full Conversation Flow (Message History)

```
[1] user:      "What's the weather in Mumbai?"
[2] assistant: tool_call → get_weather(city="Mumbai")
[3] tool:      {"temperature": 32, "condition": "Sunny", "humidity": "78%"}
[4] assistant: "It's currently 32°C and sunny in Mumbai with 78% humidity."
```

You must send message [3] back into the conversation as a `tool` role message.

---

## Key Concepts

| Concept | Meaning |
|---|---|
| **Tool schema** | JSON definition of available functions (name + description + params) |
| **tool_choice** | Force the model to call a specific tool, or let it decide (`"auto"`) |
| **Parallel tool calls** | Model can call multiple tools in one turn |
| **tool role message** | The message you inject with the function result |
| **Multi-turn** | Tool results go back into conversation history for the model to reason over |

---

## Real-World Use Cases

- **Search agent:** model calls `web_search(query)` when it needs current info
- **Database agent:** model calls `run_sql(query)` to get data
- **Mercury Grid:** agents call `get_forecast(sku_id)`, `get_competitor_price(sku_id)` etc.
- **Calendar assistant:** model calls `create_event(title, time, participants)`

---

## Common Pitfalls

1. **Vague descriptions** — the model uses the description to decide when to call.  
   Bad: `"gets data"` → Good: `"Fetches 7-day demand forecast for a specific SKU"`

2. **Not handling the tool call** — if model returns `tool_calls`, you must process it.  
   If you send it back as a plain assistant message, the model gets confused.

3. **Missing tool result in history** — always append the tool result before the next model call.

4. **Assuming the model always calls a tool** — with `tool_choice: "auto"`, the model  
   may answer directly without calling any tool if it thinks it knows the answer.

---

## See Code Example
→ [examples/tool_calling_example.py](examples/tool_calling_example.py)
