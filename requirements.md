# Requirements (Kiro)

## 1) Product Brief
**Product Name:** Mercury Grid  
**Type:** Agentic AI decision platform for retail/commerce/marketplace teams  
**Goal:** Improve pricing, inventory, and demand decisions with explainable AI recommendations.

## 2) Problem Statement
Retail teams struggle with fragmented data, delayed insights, stockouts, overstock, and reactive pricing. Mercury Grid provides real-time, data-driven recommendations with human approval controls.

## 3) Objectives
- Increase gross margin through better pricing decisions.
- Reduce stockout and overstock risk.
- Improve planner productivity via automation.
- Deliver explainable, auditable AI recommendations.

## 4) Users
- Marketplace seller / SMB founder
- Pricing analyst
- Inventory & operations manager
- Category manager

## 5) Functional Requirements
1. Ingest sales, inventory, and competitor pricing data.
2. Generate SKU-level demand forecasts (7/14/30 day horizons).
3. Produce AI recommendations for price, reorder, and promo actions.
4. Stream live alerts and recommendations to UI in real time.
5. Provide approval/rejection workflow with reason tracking.
6. Show expected impact (revenue, margin, stockout risk).
7. Maintain audit trail of all decisions and overrides.

## 6) Non-Functional Requirements
- **Performance:** Alert-to-UI latency under 2 seconds (target).
- **Scalability:** Support thousands of SKUs per tenant.
- **Reliability:** Graceful fallback to rule-based recommendations.
- **Security:** JWT auth, role-based access, tenant isolation.
- **Observability:** Structured logs, metrics, traceable decision IDs.

## 7) Tech Constraints (Required Stack)
- Backend: FastAPI
- Realtime: Socket.IO
- Cache/event/state: Redis
- Data processing: Apache Spark
- Frontend: React + Tailwind CSS
- Agent orchestration: LangGraph
- LLM framework: LangChain-compatible LLM integration

## 8) AI/ML Requirements
- Use an **LLM** for explanation generation, recommendation reasoning, and supervisor summaries.
- Use **machine learning algorithms** for forecasting and optimization:
	- Time-series forecasting for SKU demand (e.g., Prophet/XGBoost/LSTM baseline options)
	- Price recommendation model with elasticity-aware scoring
	- Anomaly detection for demand spikes/drops
- Use **LangGraph** to model multi-agent workflow, state transitions, retries, and tool-calling between agents.

## 9) Agent Requirements
- Demand Agent: demand forecast + stockout risk.
- Pricing Agent: margin-safe dynamic pricing recommendations.
- Inventory Agent: reorder/transfer suggestions.
- Supervisor Agent: conflict resolution + final ranked plan.
- Risk rules: confidence/risk threshold gates for human approval.
- Agent runtime must be implemented as a LangGraph state graph.

## 10) MVP Scope
- Data ingestion (sales, inventory, competitor prices)
- 3 agents (Demand, Pricing, Supervisor)
- 2 screens (Command Center, SKU Decision Board)
- Approval workflow and impact simulation
- LLM-powered explanation panel for each recommendation

## 11) Success Metrics
- Forecast accuracy (MAPE) improvement vs baseline
- Estimated margin uplift (%)
- Reduction in projected stockouts (%)
- Decision turnaround time
- User action completion rate

## 12) Out of Scope (MVP)
- Direct writeback to ERP/WMS in production
- Advanced multi-language localization
- Custom ML training UI
