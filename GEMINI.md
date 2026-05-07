# Moving to Google Cloud Agents (Hybrid Approach)

This project has been migrated to a **Hybrid Google Cloud Agent** architecture.

## Architecture
- **Orchestration:** [Vertex AI Agent Builder (Playbooks)](./playbooks/)
- **Tools:** [TypeScript Tool Server](./tool_server.ts) (Cloud Run)
- **Model:** Gemini 2.0 Pro / Flash (Managed by Vertex AI)

## Components

### 1. Playbooks (`/playbooks/*.yaml`)
These files contain the instructions and goals for each agent. You can import them into the Vertex AI Agent Builder console.
- `root_orchestrator`: Welcomes the user.
- `adhesion_pipeline`: Orchestrates the sequence.
- `document_processor`: Handles OCR and validation.
- `fraud_detector`: Detects falsifications.
- `eligibility_checker`: Checks community rules.
- `decision_maker`: Provides the final answer.

### 2. Tool Server (`tool_server.ts`)
A lightweight Express server that exposes the original TypeScript tools as a REST API.
This allows the Playbooks to continue using the complex validation logic written in TypeScript.

### 3. OpenAPI Spec (`playbooks/openapi.json`)
The OpenAPI specification generated from the Zod schemas of your tools. 
Use this file when creating a "Tool" in Vertex AI Agent Builder.

## Deployment Steps

1.  **Deploy the Tool Server:**
    Update `terraform/variables.tf` to point to `tool_server.ts` and run `terraform apply`.
    Note the URL of the deployed service.

2.  **Configure Vertex AI Agent Builder:**
    - Create a new **Agent**.
    - Create a **Tool** by uploading `playbooks/openapi.json`.
    - Set the **URL** to your Cloud Run service URL.
    - Create the **Playbooks** by copying the instructions from the `.yaml` files.

3.  **Link Playbooks:**
    In the Vertex AI Console, link the Playbooks together as described in the `instructions` field of each YAML.
