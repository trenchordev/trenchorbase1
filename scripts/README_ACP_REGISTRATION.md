ACP Registration Instructions

Use this guide to register the agent on Virtuals ACP dashboard using the example payload in `scripts/acp_registration_payload.json`.

Steps:

1. Connect wallet
   - Open https://app.virtuals.io and connect the wallet corresponding to `agentAddress` in the JSON.

2. Join ACP / Register New Agent
   - Navigate to Build tab -> Join ACP -> Register New Agent.

3. Agent Profile
   - Upload a profile picture (JPG/PNG/WebP, <= 50KB) or provide the `profilePictureUrl` if allowed.
   - Set the Agent Name to `agentName`.
   - Choose role `Provider` or appropriate role.

4. Business Description
   - Paste the `businessDescription` value. Keep it short (2-3 sentences, < 500 chars).

5. Add Job Offering(s)
   - Click `Add Job`.
   - For each offering in `jobOfferings`: fill `Job Name`, `Job Description`, `Price (USD)`, `Require Funds` toggle, and `SLA (minutes)`.

6. Setup Schema
   - In `Setup Schema` choose `Schema` mode and paste the `serviceRequirementSchema` JSON into the schema builder (or use fields to reproduce it).
   - Ensure every field has a description.
   - Repeat for `deliverableRequirementSchema`.

7. Save
   - Save the job offering and publish/register the agent.

Programmatic registration (optional)
 - You can register job offerings programmatically using the admin API endpoint `POST /api/admin/job-offerings`.
 - If you set an environment variable `ADMIN_API_KEY`, include it in requests as header `x-admin-key` or `x-api-key`.

Example curl (with admin key):
```bash
curl -X POST http://localhost:3000/api/admin/job-offerings \
   -H "Content-Type: application/json" \
   -H "x-admin-key: $ADMIN_API_KEY" \
   -d @scripts/acp_registration_payload.json
```

Notes & Tips
- Start with low price (e.g., $0.01) while testing as recommended by ACP docs.
- Use a test wallet and test X/Telegram accounts for integrations.
- If ACP UI requires specific input fields, use the JSON as canonical source and replicate values in the form.

Automation note
- This repo provides API endpoints that the ACP platform will call (or that you can use to validate input):
  - `POST /api/admin/job-offerings` to programmatically register job offering into Redis.
  - `POST /api/agent/job/initiate` to initiate/validate a job request.
- Ensure `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are set before using programmatic registration.
