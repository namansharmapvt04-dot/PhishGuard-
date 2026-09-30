<div align="center">

# 🎣 PhishGuard

### AI-Powered Phishing Simulation & Security Awareness Platform

**OJT Project — Polaris School of Technology, Bengaluru | 2025**

[![Python](https://img.shields.io/badge/Python-3.11+-blue?style=flat-square&logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-009688?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![LangGraph](https://img.shields.io/badge/LangGraph-0.cd c:\Desktop\PhishGuard\backend
venv\Scripts\activate

# Run all tests with verbose output
venv\Scripts\python -m pytest tests/ -v

# Run with coverage report
venv\Scripts\python -m pytest tests/ -v --cov=app --cov-report=term-missing

# Run just one file
venv\Scripts\python -m pytest tests/test_auth.py -v

# Run a single test
venv\Scripts\python -m pytest tests/test_auth.py::test_login_success -v
2+-1C3C3C?style=flat-square&logo=langchain&logoColor=white)](https://www.langchain.com/langgraph)
[![Groq](https://img.shields.io/badge/Groq-LLaMA--3--70B-F55036?style=flat-square&logo=groq&logoColor=white)](https://console.groq.com/)
[![ChromaDB](https://img.shields.io/badge/ChromaDB-Vector%20Store-orange?style=flat-square)](https://www.trychroma.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)

</div>

---

## 📖 Overview

**PhishGuard** is an intelligent phishing simulation platform that helps organizations train employees to recognize and resist phishing attacks. Instead of manual template creation, PhishGuard uses a **multi-agent AI pipeline** (powered by **LangGraph + Groq**) to automatically generate realistic, personalized phishing emails, run campaigns against target employees, track engagement, and produce actionable security awareness reports.

> **Key idea:** Automate the "Red Team" phishing workflow with AI — from template drafting to insight analysis — so security teams can run continuous awareness programs at scale without manual effort.

---

## ✨ Features

| Feature | Description |
|---|---|
| 🤖 **AI Campaign Generation** | LangGraph multi-agent pipeline drafts, evaluates, and personalizes phishing emails automatically |
| 📊 **RAGAS Quality Gate** | Templates are scored by RAGAS (≥ 0.75) before sending; low-quality drafts are retried or escalated |
| 🔍 **RAG-powered Realism** | ChromaDB retrieves top-5 real phishing patterns to ground AI generation in authentic tactics |
| 📅 **Flexible Scheduling** | Campaigns can start immediately or be scheduled for a future date/time |
| ⏸ **Pause & Resume** | Active campaigns can be paused and resumed without resending emails |
| 📈 **Real-time Tracking** | SSE (Server-Sent Events) stream click/open/submit events to the dashboard live |
| 🛡️ **Insight Reports** | Insight Analyst agent generates per-campaign phishing susceptibility reports |
| 🏢 **Multi-tenant Ready** | Organizations and managers are isolated; JWT-based role auth (Admin / Manager) |

---

## 🏗️ Architecture

### LangGraph Multi-Agent Pipeline

```
Campaign Planner
      │
      ▼
Template Generator  ◄──── ChromaDB (RAG: top-5 phishing patterns)
      │
      ▼
Realism Evaluator   ◄──── RAGAS scoring (threshold: 0.75)
      │
      ├── score < 0.75 → retry (max 3×) → ESCALATED
      │
      └── score ≥ 0.75
            │
            ▼
Personalisation Agent  ◄──── Target employee data
            │
            ▼
    Insight Analyst  (runs after campaign DONE)
```

### Campaign State Machine

```
DRAFT ──► GENERATING ──► READY ──► RUNNING ──► DONE
                │                     │
             (fail×3)                 ↕
                │                  PAUSED
                ▼
           ESCALATED         SCHEDULED
```

| State | Description |
|---|---|
| `DRAFT` | Campaign created, not yet launched |
| `GENERATING` | AI pipeline running — templates being generated |
| `READY` | Template approved (RAGAS score ≥ 0.75) |
| `ESCALATED` | All 3 AI retries failed — awaiting admin review |
| `SCHEDULED` | Approved and queued for a future start time |
| `RUNNING` | Emails live; click/open tracking active |
| `PAUSED` | Tracking suspended by manager |
| `DONE` | Tracking window closed; report available |

---

## 🧰 Tech Stack

### Backend

| Layer | Technology |
|---|---|
| API Framework | FastAPI + Uvicorn |
| Agent Orchestration | LangGraph 0.2+ |
| Primary LLM | Groq — `llama-3-70b-8192` (free tier, low latency) |
| Fallback LLM | OpenAI `gpt-4o` (quality escalation) |
| Embedding Model | `all-MiniLM-L6-v2` (runs locally on CPU) |
| Vector Store | ChromaDB (≈ 1,000 phishing patterns) |
| Evaluation | RAGAS (faithfulness + relevancy scoring) |
| Database | PostgreSQL 16 |
| Cache / Queue | Redis |
| Auth | JWT (HS256) — Admin / Manager roles |
| Real-time | SSE (Server-Sent Events) |

### Frontend

| Layer | Technology |
|---|---|
| Framework | React 18 |
| State Management | Context API + React Query |
| Styling | Tailwind CSS |
| Charts | Recharts |

---

## 📁 Project Structure

```
PhishGuard-/
├── backend/
│   ├── app/
│   │   ├── agents/                  # LangGraph agents
│   │   │   ├── campaign_planner.py
│   │   │   ├── template_generator.py
│   │   │   ├── realism_evaluator.py
│   │   │   ├── personalisation_agent.py
│   │   │   └── insight_analyst.py
│   │   ├── api/                     # FastAPI routers
│   │   │   ├── campaigns.py
│   │   │   ├── auth.py
│   │   │   └── tracking.py
│   │   ├── models/                  # SQLAlchemy ORM models
│   │   ├── rag/                     # ChromaDB + embeddings
│   │   └── core/                    # Config, JWT, SSE
│   ├── tests/
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   ├── components/
│   │   └── hooks/
│   └── package.json
├── docs/
│   ├── BRD.docx                     # Business Requirements Document
│   └── TRD.docx                     # Technical Requirements Document
└── README.md
```

---

## 🚀 Getting Started

### Prerequisites

- Python `3.11+`
- Node.js `20+`
- PostgreSQL `16`
- Redis `7`
- A [Groq API key](https://console.groq.com/) (free)
- Optional: OpenAI API key (fallback LLM)

### 1. Clone the repo

```bash
git clone https://github.com/namansharmapvt04-dot/PhishGuard-.git
cd PhishGuard-
```

### 2. Backend setup

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate       # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Copy and configure environment variables
cp .env.example .env
# Edit .env and fill in your keys (see below)

# Run database migrations
alembic upgrade head

# Seed the ChromaDB vector store with phishing patterns
python scripts/seed_chromadb.py

# Start the FastAPI server
uvicorn app.main:app --reload --port 8000
```

### 3. Frontend setup

```bash
cd frontend
npm install
npm run dev
```

The app will be available at `http://localhost:5173`.

### Environment Variables

```env
# .env

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/phishguard

# Redis
REDIS_URL=redis://localhost:6379

# JWT
SECRET_KEY=your_super_secret_key_here
ACCESS_TOKEN_EXPIRE_MINUTES=60

# LLM (primary)
GROQ_API_KEY=gsk_...

# LLM (fallback, optional)
OPENAI_API_KEY=sk-...

# ChromaDB
CHROMA_PERSIST_DIR=./chroma_db

# App
ENVIRONMENT=development
FRONTEND_URL=http://localhost:5173
```

---

## 🔌 API Endpoints (Key)

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/login` | Login, returns JWT |
| `POST` | `/api/campaigns/` | Create new campaign (`DRAFT`) |
| `POST` | `/api/campaigns/{id}/launch` | Launch AI generation |
| `GET` | `/api/campaigns/{id}/stream` | SSE stream for real-time status |
| `PATCH` | `/api/campaigns/{id}/pause` | Pause a running campaign |
| `PATCH` | `/api/campaigns/{id}/resume` | Resume a paused campaign |
| `GET` | `/api/campaigns/{id}/report` | Fetch insight report (`DONE` only) |
| `GET` | `/api/tracking/click/{token}` | Employee click-tracking pixel |

---

## 🤖 How the AI Pipeline Works

1. **Campaign Planner** — Takes the campaign goal (e.g., *"IT credential phishing"*) and drafts a strategy: sender persona, subject line approach, urgency level, and call-to-action type.

2. **Template Generator** — Queries ChromaDB for the top-5 most relevant real-world phishing patterns (RAG), then asks Groq's LLaMA-3 to generate the email body grounded in those examples.

3. **Realism Evaluator** — Scores the template using RAGAS metrics (faithfulness to real patterns + relevancy to campaign goal). If score < 0.75, the pipeline retries up to 3 times. After 3 failures, the campaign is marked `ESCALATED` and flagged for admin review.

4. **Personalisation Agent** — Takes the approved template and customises it per target employee (name, role, department, company-specific details) to maximise realism.

5. **Insight Analyst** — After the tracking window closes, analyses click/open/submit data and writes a phishing susceptibility report per campaign and per department.

---

## 📊 RAG Setup (ChromaDB)

The vector store contains ~1,000 real phishing email patterns sourced from public security research datasets. Each document is embedded using `sentence-transformers/all-MiniLM-L6-v2` (runs locally, no API cost).

```python
# Retrieval example
results = collection.query(
    query_texts=["IT credential reset phishing"],
    n_results=5
)
# Returns top-5 closest phishing patterns → passed to Template Generator as context
```

---

## 👨‍💻 Team

| Name | Roll No | Role |
|---|---|---|
| **Naman Sharma** | 251810700011 | Backend, LangGraph agents, API, DB |
| **Pratham V Doyizode** | — | Frontend, UI/UX, Campaign dashboard |

**Institution:** Polaris School of Technology, Bengaluru
**Program:** B.Tech CSE — On-the-Job Training (OJT) 2025

---

## 📄 Documentation

| Document | Description |
|---|---|
| `docs/BRD.docx` | Business Requirements Document — scope, stakeholders, revenue model |
| `docs/TRD.docx` | Technical Requirements Document — architecture, APIs, DB schema |

---

## ⚠️ Disclaimer

PhishGuard is intended **strictly for authorised security awareness training** within organisations that have obtained written consent from all participants. Sending phishing simulations without proper authorisation is illegal and unethical. The authors are not responsible for any misuse of this software.

---

## 📜 License

This project is licensed under the **MIT License** — see [LICENSE](LICENSE) for details.

---

<div align="center">

Made with ❤️ at **Polaris School of Technology, Bengaluru**

</div>
