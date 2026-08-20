# Product Requirements Document
## Workbench — A Model-Neutral, AI-First Work Platform

**Version:** 1.0
**Status:** Draft for Review
**Document owner:** Product

---

## 1. Overview

### 1.1 Summary

Workbench is a model-neutral, AI-first desktop work platform. It gives knowledge workers a single agentic environment that can drive any model or agent — Codex, Claude, Gemini, local models, and third-party agents — against their real work systems: local files, browser, email, calendar, drive, code, and SaaS tools.

Conceptually, Workbench is **"OpenRouter for work"**: a routing and orchestration layer that decouples the *work* a user wants done from the *model* that does it. Users bring the task; Workbench brokers models, capabilities, credentials, and context to complete it — safely, repeatably, and shareably.

### 1.2 Problem

Today's AI work tools bind the user to a single vendor's model, memory, and integration set. Cowork ties you to Claude; ChatGPT Desktop ties you to OpenAI. Switching models means losing your skills, connectors, history, and automation. Meanwhile:

- Model quality leapfrogs constantly; lock-in means users can't route the *right* model to the *right* task.
- Integrations are rebuilt per-vendor; there's no portable capability layer.
- Successful ad-hoc workflows evaporate — there's no way to capture, reuse, or share "how we did that."
- Enterprises can't govern credentials, permissions, and auditing across a fragmented AI tool sprawl.

### 1.3 Goals

1. **Model neutrality** — Route any task to any model/agent, swappable mid-workflow, with no loss of context or capability.
2. **Reusable know-how** — Let users capture working knowledge and agent capabilities as **Skills**, and promote successful runs into shareable Skills.
3. **Persistent experiences** — Let AI workflows crystallize into **Apps** that can be shared, forked, and customized across a company.
4. **Universal connectivity** — Connect to local FS, browser, Gmail, Calendar, Drive, GitHub, and arbitrary systems via **Plugins/Connectors**, reusing MCP and existing plugin ecosystems rather than rebuilding.
5. **Enterprise-grade governance** — Control permissions, credentials, approvals, and audit through a secure **Capability Gateway**.

### 1.4 Non-goals (v1)

- Building proprietary foundation models.
- A mobile-first experience (desktop-first; mobile companion later).
- Replacing dedicated IDEs, CRMs, or office suites — Workbench orchestrates them, it doesn't replace them.

---

## 2. Competitive & Prior-Art Evaluation

### 2.1 Cloudflare OS

**What we take:** The idea that AI workflows can be *materialized into persistent Apps* — durable, shareable artifacts generated from an agentic session rather than throwaway chat transcripts. Also its posture toward edge-deployed, sandboxed execution.

**Where we differ:** Cloudflare OS is infrastructure-flavored and platform-bound. Workbench is a work-surface for end users and is deliberately model-neutral rather than tied to one runtime.

### 2.2 Cindy

**What we take:** The assistant-as-teammate framing and emphasis on proactive, multi-step task execution.

**Where we differ:** Cindy is an opinionated assistant. Workbench is an open platform: the assistant is one surface, but Skills, Apps, Plugins, and Automations are first-class, portable, and governable.

### 2.3 Claude Cowork / ChatGPT Desktop

**What we take:** The desktop agentic UX — a persistent workspace where an agent can see files, take actions, and work alongside the user.

**Where we differ:** Both are single-vendor. Workbench's entire thesis is the abstraction layer *above* the model, so users are never locked to one provider's model, memory, or integrations.

---

## 3. Product Model

The conceptual spine of Workbench. Five primitives, cleanly separated:

| Primitive | Role | One-liner |
|-----------|------|-----------|
| **Plugins / Connectors** | Provide **abilities** | Raw access to systems and actions (FS, Gmail, GitHub, MCP servers). |
| **Skills** | Provide **know-how** | Packaged working knowledge + agent capability: how to do a kind of work well. |
| **Tasks** | **Execute** work | A single unit of agentic work, driven by a chosen model, using Skills + Plugins. |
| **Apps** | Provide **experiences** | Persistent, shareable UIs generated from workflows; forkable and customizable. |
| **Automations** | **Repeat** work | Scheduled or triggered Tasks/Apps that run without a human each time. |

**The sentence that defines the product:**
> **Plugins provide abilities → Skills provide know-how → Tasks execute work → Apps provide experiences → Automations repeat work.**

Everything routes through the **Capability Gateway**, which governs permissions, credentials, approvals, and auditing across all five primitives.

---

## 4. Core Concepts (Detailed)

### 4.1 Plugins / Connectors (abilities)

Plugins are the integration layer — the *hands* of the system. They are deliberately separate from Skills (know-how) so that abilities and knowledge can evolve independently.

**Requirements:**
- **First-party connectors:** Local filesystem, Browser, Gmail, Google Calendar, Google Drive, GitHub.
- **Protocol reuse — do not rebuild integrations:**
  - **MCP (Model Context Protocol):** Any MCP server is mountable as a Plugin. Tools, resources, and prompts exposed by the server become available abilities.
  - **OpenAI plugin ecosystem compatibility:** Support the OpenAI plugin manifest/spec so existing plugins can be adopted with minimal glue.
- **Capability descriptors:** Each Plugin declares the actions it exposes, the scopes/permissions it needs, and whether actions are read, write, or destructive.
- **Credential model:** Credentials are held by the Capability Gateway, never by Skills or model providers.
- **Local & remote:** Support both local plugins (e.g., filesystem access) and remote/hosted connectors.

### 4.2 Skills (know-how)

Skills are **reusable packages of working knowledge and agent capabilities** — the core IP users build up over time.

**Requirements:**
- **Composition:** A Skill bundles instructions/prompts, references to required Plugins, example inputs/outputs, evaluation criteria, and optional sub-agent definitions.
- **Reusable packages:** Skills are versioned, portable artifacts — installable, updatable, and dependency-aware (a Skill can declare "requires GitHub Plugin, requires Drive Plugin").
- **Save-from-success:** After a successful Task run, the user can **promote that workflow into a Skill** in one action. Workbench captures the steps, tools used, prompts, and decisions and proposes a reusable Skill definition the user can name, edit, and save.
- **Company sharing:** Skills can be shared within a company via a **Skill Library** with roles/permissions, so a workflow discovered by one person becomes org capability.
- **Model-neutral:** A Skill declares *what good looks like*, not which model must run it. Any capable model can execute a Skill; the router picks or the user overrides.

### 4.3 Tasks (execute)

A Task is one unit of agentic work.

**Requirements:**
- **Model routing:** User can pick the model/agent explicitly, or let Workbench auto-route based on task type, cost, latency, and capability. Model is **swappable mid-Task** without losing context.
- **Context assembly:** Task context is composed from attached files, connected systems (via Plugins), selected Skills, and prior history — provider-independent so it survives model switches.
- **Transparency:** Every tool call, file touch, and external action is visible and, where required, gated by approval.
- **Output:** A Task can end as a deliverable, be promoted to a Skill, or be crystallized into an App.

### 4.4 Apps (experiences)

Borrowed and extended from Cloudflare OS: **persistent Apps generated from AI workflows.**

**Requirements:**
- **Generation:** Any successful workflow can be turned into an App — a durable mini-application with its own UI, inputs, and behavior — rather than a one-off chat.
- **Share / fork / customize:** Apps are shareable within a company, **forkable** (copy-and-modify), and customizable. Forking preserves lineage so improvements can be tracked upstream.
- **Powered by the stack:** An App runs on top of Skills + Plugins + a routed model, all governed by the Gateway.
- **Examples:** "Weekly investor update generator," "PR triage cockpit," "Contract redline reviewer."

### 4.5 Automations (repeat)

**Requirements:**
- **Triggers:** Schedule (cron-like), event-based (new email, new PR, calendar event, file change), or manual.
- **Runs Tasks or Apps** unattended, using pinned Skills, Plugins, and model routing.
- **Guardrails:** Automations run under the same Gateway approvals/limits; destructive actions can require human-in-the-loop even when automated.
- **Observability:** Each run is logged, diffable, and re-runnable.

### 4.6 Capability Gateway (governance spine)

The secure control plane every action passes through.

**Requirements:**
- **Permissions:** Fine-grained, per-Plugin, per-action (read/write/destructive), per-user, per-role scopes.
- **Credentials:** Central vault; credentials injected at execution time, never exposed to model providers or embedded in Skills/Apps.
- **Approvals:** Human-in-the-loop gates for sensitive/destructive/irreversible actions, configurable by policy.
- **Auditing:** Immutable log of every action — who, which model, which Plugin, what data touched, what was approved. Exportable for compliance.
- **Data governance:** Policy controls over which models may see which data classes (e.g., "PII may only route to local or approved models").

---

## 5. Personas & Key Use Cases

**Personas**
- *Individual power user* — wants the best model per task and to stop losing good workflows.
- *Team lead* — wants to share proven Skills/Apps and standardize how work gets done.
- *IT / Security admin* — wants control of credentials, permissions, and audit across all AI activity.

**Key use cases**
1. Run a research + drafting Task, switch from a fast model to a stronger one mid-way, keep all context.
2. Promote that run to a "Competitive Brief" Skill and share it with the team.
3. Turn a recurring reporting workflow into an App the whole company forks.
4. Automate a "triage inbound PRs every morning" job under approval guardrails.
5. Admin restricts the Gmail Plugin's write actions to require approval, and audits all sends.

---

## 6. Functional Requirements Summary

- Model-neutral routing with mid-task model swap and provider-independent context.
- Skill authoring, versioning, promotion-from-success, and company Skill Library.
- App generation, sharing, forking (with lineage), and customization.
- Plugin/Connector framework with first-party connectors + MCP + OpenAI-plugin compatibility.
- Automations with schedule/event triggers and Gateway guardrails.
- Capability Gateway: permissions, credential vault, approvals, immutable audit, data-class routing policy.

---

## 7. Non-Functional Requirements

- **Security:** Zero standing credential exposure to model providers; sandboxed execution for Plugins and generated Apps.
- **Privacy / data residency:** Support local-model routing for sensitive data classes; configurable data-class → model policies.
- **Reliability:** Automations must be idempotent-friendly and re-runnable; every run logged.
- **Extensibility:** New models, Plugins, and protocols added without core rewrites.
- **Performance:** Model routing overhead negligible relative to inference; context assembly cached across model swaps.

---

## 8. UI / UX

See Section 9 for annotated mockups. Core surfaces:

1. **Workspace / Task view** — the agentic desktop: conversation + action stream + file/artifact panel + a persistent **model switcher** and **Skill/Plugin tray**.
2. **Skill Library** — browse, install, author, version, and share Skills; "Save as Skill" entry point from any completed Task.
3. **App gallery** — company Apps with share / fork / customize actions and lineage.
4. **Plugin / Connector manager** — connect systems, see declared abilities and scopes.
5. **Capability Gateway console** — permissions, credentials, approval queue, audit log.
6. **Automations** — triggers, schedules, run history.

---

## 9. Open Questions

- Default auto-routing policy: cost-optimized vs. quality-optimized out of the box?
- Skill/App marketplace beyond a single company — cross-org sharing model?
- Monetization: per-seat, usage-based model brokering, or both?
- How much of the OpenAI plugin spec to support given ecosystem shifts toward MCP?

---

*End of PRD v1.0.*
