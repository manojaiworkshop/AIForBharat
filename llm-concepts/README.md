# LLM Concepts — Tool Calling & Chain of Thought

A focused learning folder to understand two foundational concepts in modern LLM systems.

## Contents

| File | What you'll learn |
|---|---|
| [tool-calling.md](tool-calling.md) | How GPT-based models call external tools/functions |
| [chain-of-thought.md](chain-of-thought.md) | What CoT is and how it improves model reasoning |
| [examples/tool_calling_example.py](examples/tool_calling_example.py) | Python example: GPT calling a weather function |
| [examples/cot_example.py](examples/cot_example.py) | Python example: Prompting GPT with CoT |
| [examples/combined_example.py](examples/combined_example.py) | Tool calling + CoT together (realistic agent pattern) |

## Quick Mental Model

```
Tool Calling  → model decides WHAT to do and uses external functions to act
CoT           → model thinks STEP BY STEP before giving a final answer
Together      → agent that reasons through a problem AND uses tools to solve it
```
