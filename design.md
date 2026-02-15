# Design (Kiro) — Brief

## 1) High-Level Architecture
Mercury Grid uses an event-driven architecture:
- **React + Tailwind** for dashboards and copilot UX
- **FastAPI** for APIs, orchestration, and policy enforcement
- **Socket.IO** for real-time live updates
- **Redis** for cache, pub/sub, queue state, and session memory
- **Spark** for batch ETL, feature generation, and anomaly jobs
- **LLM + LangChain layer** for explanation and reasoning
- **LangGraph** for multi-agent workflow/state orchestration

## 2) Core Components
1. **Ingestion Service (FastAPI):** accepts sales/inventory/competitor events.
2. **Feature Pipeline (Spark):** computes rolling demand and risk features.
3. **ML Inference Service:** runs forecasting, pricing, and anomaly models.
4. **Agent Orchestrator (LangGraph + FastAPI):** runs specialist agents and supervisor as a state graph.
5. **LLM Reasoning Service:** creates explanations, rationale, and recommendation summaries.
4. **Realtime Gateway (Socket.IO):** pushes alerts and recommendation events.
5. **Decision Service:** stores recommendations, approvals, status transitions.

## 3) Data Flow
1. Source data is ingested via API.
2. Spark builds features and detects anomalies.
3. ML models generate forecasts/scores (demand, pricing, anomalies).
4. LangGraph executes agent workflow and state transitions.
5. LLM generates explanation for each candidate action.
6. Supervisor ranks and publishes final plan.
5. UI receives updates via Socket.IO.
6. User approves/rejects; decision history is persisted.

## 4) Agent Graph (LangGraph)
- **Nodes:** Demand Agent, Pricing Agent, Inventory Agent, Supervisor Agent, Risk Guardrail Node.
- **State:** tenant_id, SKU context, feature snapshot, model outputs, recommendation list, risk/confidence.
- **Edges:** parallel specialist execution -> risk validation -> supervisor merge -> publish.
- **Fallback path:** if LLM/model confidence is low, route to rule-based recommendation node.

## 5) Realtime Event Model
- `alert.stockout_risk`
- `alert.competitor_drop`
- `agent.recommendation.created`
- `agent.supervisor.final_plan`
- `decision.status.updated`

## 6) Security and Governance
- JWT authentication + role-based permissions
- Tenant-scoped keys/channels in Redis
- Rule guardrails for margin floor and max price movement
- Full audit trail for compliance and explainability

## 7) UI Design (Brief)
- **Command Center:** KPI cards + live alert feed + run plan action
- **SKU Decision Board:** recommendation table with approve/reject actions
- **Copilot Panel:** “why” explanations, confidence, and alternatives

## 8) MVP Design Principles
- Keep workflows simple and high-signal.
- Prefer explainability over model complexity.
- Human-in-the-loop for high-risk actions.
- Use LLM for reasoning/explanations, ML algorithms for predictions, and LangGraph for deterministic agent flow.
