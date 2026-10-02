# Autopay Recovery Voice Agent

An automated conversational voice agent for subscription autopay recovery. The system connects to telephony (Twilio), uses an LLM (Google Gemini) for natural-language intent recognition, interacts politely with customers regarding failed autopay debits, records call transcripts, and updates recovery outcomes on an operational dashboard.

---

## Table of Contents
1. [Project Overview](#project-overview)
2. [Architecture](#architecture)
3. [Tech Stack](#tech-stack)
4. [Project Structure](#project-structure)
5. [Core User Flow & Intent States](#core-user-flow--intent-states)
6. [Environment Variables](#environment-variables)
7. [Installation & Setup](#installation--setup)
8. [Automated Verification Tests (13/13 Passing)](#automated-verification-tests-1313-passing)
9. [Running the Application](#running-the-application)
10. [Exposing Local Webhooks (ngrok)](#exposing-local-webhooks-ngrok)
11. [Configuring Twilio](#configuring-twilio)
12. [Configuring Google Gemini](#configuring-google-gemini)
13. [10 Fictional Customer Dataset](#10-fictional-customer-dataset)
14. [How to Run a Test Call](#how-to-run-a-test-call)
15. [Example Conversation Flow](#example-conversation-flow)
16. [Example API Requests](#example-api-requests)
17. [Security Assumptions & Guardrails](#security-assumptions--guardrails)
18. [Known Limitations](#known-limitations)

---

## Project Overview

When a recurring autopay debit fails (e.g., due to insufficient balance, card expiry, or bank network issues), businesses need to follow up quickly. This project provides an end-to-end voice outreach workflow:
- Lists **10 fictional customer accounts** with overdue/failed debits.
- Automatically initiates an outbound phone call via **Twilio**.
- Delivers a personalized initial greeting using dynamic customer metadata (Name, Due Date, Amount Due).
- Listens to the customer's response using Twilio's Speech-to-Text engine.
- Reasons over customer intent with **Google Gemini LLM** (with a deterministic rule-engine fallback).
- Records complete turn-by-turn conversation transcripts and categorizes the call outcome (`retry_requested`, `manual_payment`, `callback_requested`, `declined`, `no_response`, or `unknown`).
- Displays live call status, customer profile, and conversation transcripts on an operational web dashboard.

---

## Architecture

```text
                      +-----------------------------+
                      |   Operations Web Dashboard  |
                      |   (HTML5, Vanilla CSS, JS)  |
                      +--------------+--------------+
                                     |
                                     | REST (Fetch)
                                     v
                      +-----------------------------+
                      |     Express.js API Server   |
                      |        (TypeScript)         |
                      +--------------+--------------+
                                     |
         +---------------------------+---------------------------+
         |                           |                           |
         v                           v                           v
+------------------+       +-------------------+       +--------------------+
|  Customer/Call   |       |   Twilio Voice    |       |   Google Gemini    |
|   Repositories   |       |  Telephony Gateway|       |     1.5 Flash      |
|  (Local JSON/DB) |       |  (TwiML Gather)   |       | (Intent Reasoning) |
+------------------+       +-------------------+       +--------------------+
         ^                           |                           |
         |                           v                           v
         |                 Customer Phone Call                   |
         +-------------------------------------------------------+
```

### Request Flow
1. **Outbound Trigger**: User clicks **"Call Customer"** on the dashboard &rarr; `POST /api/calls/:customerId`.
2. **Telephony Connection**: Server calls Twilio REST API to place outbound call.
3. **Voice Webhook**: When answered, Twilio requests `POST /api/webhooks/voice?customerId=...`.
4. **Dynamic Prompt**: Server returns TwiML with `<Gather input="speech">` reciting personalized greeting:
   *"Hi Rahul, this is an automated payment assistant calling regarding your upcoming payment of ₹1,499. Your autopay attempt was unsuccessful. Would you like to retry the payment?"*
5. **Speech Processing**: Twilio transcribes speech and sends `SpeechResult` to `POST /api/webhooks/voice/input`.
6. **Gemini Reasoning**: Server feeds customer context + dialogue history to Gemini, extracting the spoken response and classified intent.
7. **Persistence & UI**: Server appends to turn-by-turn transcript, records outcome (`retry_requested`, `manual_payment`, etc.), and updates the dashboard.

---

## Tech Stack

- **Runtime & Language**: Node.js (v18+) with TypeScript (ES2022 / NodeNext modules)
- **Backend Framework**: Express.js
- **Telephony & Speech**: Twilio Voice API (`twilio` SDK, TwiML `<Gather>` speech recognition)
- **LLM Reasoning**: Google Gemini API (`@google/generative-ai`)
- **Data Persistence**: JSON Repository store ([src/data/customers.json](src/data/customers.json), [src/data/calls.json](src/data/calls.json))
- **Frontend Dashboard**: Semantic HTML5, CSS3 with glassmorphism & dark theme, Vanilla JavaScript (Zero front-end build overhead)
- **Configuration & Secrets**: `dotenv` with centralized, typed validation in [src/config/env.ts](src/config/env.ts)

---

## Project Structure

```text
├── .env                           # Environment configuration (gitignored)
├── .env.example                   # Environment variable template & documentation
├── .gitignore                     # Git ignore rules (node_modules, .env, dist)
├── package.json                   # Dependencies and scripts (build, start, dev, test:api)
├── tsconfig.json                  # TypeScript compiler settings (ES2022, NodeNext)
├── README.md                      # Documentation & setup guide
├── scripts/
│   └── test-api.ts                # Automated E2E verification test suite (13/13 passing)
└── src/
    ├── server.ts                  # Server bootstrap & process lifecycle handlers
    ├── app.ts                     # Express app setup, middlewares, static files, routes
    ├── config/
    │   └── env.ts                 # Centralized typed environment config & safe logging
    ├── types/
    │   ├── customer.ts            # Customer & CallOutcome interfaces
    │   ├── call.ts                # CallRecord, TranscriptEntry & CallStatus interfaces
    │   └── webhook.ts             # Twilio voice & status webhook payload interfaces
    ├── data/
    │   ├── customers.json         # 10 realistic fictional customer records
    │   └── calls.json             # Persisted call records and transcripts
    ├── repositories/
    │   ├── customerRepository.ts  # Customer query and outcome persistence
    │   └── callRepository.ts      # Call session & transcript management
    ├── services/
    │   ├── twilioService.ts       # Twilio outbound calls & dynamic TwiML generation
    │   ├── geminiService.ts       # Gemini LLM system prompt & structured reasoning (with fallback)
    │   └── callService.ts         # Business logic coordinating calls, transcripts & outcomes
    ├── controllers/
    │   ├── customerController.ts  # GET /api/customers & GET /api/customers/:id
    │   ├── callController.ts      # POST /api/calls/:id & GET /api/calls/:id
    │   └── webhookController.ts   # Twilio webhooks (/voice, /voice/input, /voice/status)
    ├── routes/
    │   ├── customerRoutes.ts      # /api/customers routes
    │   ├── callRoutes.ts          # /api/calls routes
    │   └── webhookRoutes.ts       # /api/webhooks routes
    └── public/
        ├── index.html             # Clean operational dashboard UI
        ├── style.css              # Dark slate theme, glassmorphism & chat bubbles
        └── app.js                 # Front-end client logic & interactive turn simulator
```

---

## Core User Flow & Intent States

The agent detects customer intent and maps it to one of the following canonical outcomes:

| Customer Scenario | Example Customer Utterance | Agent Response Behavior | Recorded Outcome | Call Ends? |
|---|---|---|---|---|
| **A. Retry Payment** | *"Yes, please retry it."* | Records customer request to retry the autopay, clarifying no payment was processed by the demo. | `retry_requested` | Yes |
| **B. Manual Payment** | *"No, I'll pay manually via UPI."* | Confirms customer will pay via self-service portal. | `manual_payment` | Yes |
| **C. Decline** | *"No, cancel it."* | Acknowledges politely, notes overdue implications. | `declined` | Yes |
| **D. Inquire Why Failed** | *"Why did my autopay fail?"* | Explains bank payment attempt failed; asks to retry. | *In Progress* | No (Follow-up) |
| **E. Inquire Amount Due** | *"How much do I owe?"* | States exact customer amount due from DB; asks to retry. | *In Progress* | No (Follow-up) |
| **F. Callback Request** | *"Call me back later, I'm busy."* | Confirms a callback will be logged for convenient time. | `callback_requested` | Yes |
| **G. Silence / No Input** | *(Silence or timeout)* | Politely notes no response received and disconnects. | `no_response` | Yes |
| **H. Unclear Response** | *"Blah blah... maybe"* | Clarifies options without hallucinating. | *In Progress* | No (Follow-up) |

---

## Environment Variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

| Variable | Description | Example |
|---|---|---|
| `PORT` | Local server port | `3000` |
| `BASE_URL` | Public webhook URL (e.g. ngrok tunnel) | `https://xyz.ngrok-free.app` |
| `TWILIO_ACCOUNT_SID` | Your Twilio Account SID | `ACxxxxxxxxxxxxxxxxxxxxxxxxxxxx` |
| `TWILIO_AUTH_TOKEN` | Your Twilio Auth Token | `your_auth_token_here` |
| `TWILIO_PHONE_NUMBER` | Your Twilio Phone Number (E.164) | `+12025550199` |
| `GEMINI_API_KEY` | Google Gemini API Key | `AIzaSy...` |
| `GEMINI_MODEL` | Gemini model name | `gemini-1.5-flash` |
| `AUTHORIZED_TEST_PHONE_NUMBER` | **Safety Override:** All outbound calls will be directed to this verified number you control. | `+91XXXXXXXXXX` |

> **Note on Zero-Config Sandbox Mode:** If you run the project without Twilio or Gemini credentials, the application automatically runs in **Simulation Mode**. All outbound calls, webhooks, and conversational turn simulations work natively right out of the box without errors.

---

## Installation & Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Compile TypeScript:**
   ```bash
   npm run build
   ```

---

## Automated Verification Tests (13/13 Passing)

Run the test suite to verify all APIs, webhooks, intent classifications, and outcome persistence:

```bash
npm run test:api
```

### Actual Test Suite Output:
```text
> autopay-recovery-voice-agent@1.0.0 test:api
> tsx scripts/test-api.ts

[TEST] Starting End-to-End API Verification Tests...

[PASS] GET /api/health returns status ok
[PASS] GET /api/customers returns all 10 fictional customers
[PASS] GET /api/customers/CUST001 returns Rahul Sharma with ₹1,499 due
[TwilioService] [SIMULATION MODE] Outbound call simulated for Rahul Sharma (+919876543210). SID: SIM_1790963312713_QS45R6
[PASS] POST /api/calls/CUST001 initiates outbound call and returns callSid
[CallController] initiateCall error: Customer with ID 'NON_EXISTENT' does not exist.
[PASS] POST /api/calls/NON_EXISTENT returns 404
[WebhookController] POST /api/webhooks/voice - CustomerId: CUST001, CallSid: SIM_1790963312713_QS45R6
[PASS] POST /api/webhooks/voice returns dynamic TwiML with customer name and amount
[WebhookController] POST /api/webhooks/voice/input - CustomerId: CUST001, CallSid: SIM_1790963312713_QS45R6
[WebhookController] SpeechResult: "How much do I owe?"
[CallService] Customer 'Rahul Sharma' said: "How much do I owe?"
[CallService] Agent response: "Your total amount due is ₹1,499, due on 2026-10-05. Would you like to retry the autopay payment now?" (Outcome: null, EndCall: false)
[PASS] Webhook Input: Customer asks "How much do I owe?" -> returns exact amount and asks to retry
[WebhookController] POST /api/webhooks/voice/input - CustomerId: CUST001, CallSid: SIM_1790963312713_QS45R6
[WebhookController] SpeechResult: "Why did it fail?"
[CallService] Customer 'Rahul Sharma' said: "Why did it fail?"
[CallService] Agent response: "The previous autopay attempt was unsuccessful with your bank account. Would you like us to initiate a retry for ₹1,499?" (Outcome: null, EndCall: false)
[PASS] Webhook Input: Customer asks "Why did it fail?" -> explains and asks to retry
[WebhookController] POST /api/webhooks/voice/input - CustomerId: CUST001, CallSid: SIM_1790963312713_QS45R6
[WebhookController] SpeechResult: "Yes, retry it."
[CallService] Customer 'Rahul Sharma' said: "Yes, retry it."
[CallService] Agent response: "Thanks, Rahul Sharma. I've recorded your request to retry the autopay for ₹1,499. No payment has been processed by this demo. Goodbye!" (Outcome: retry_requested, EndCall: true)
[PASS] Webhook Input: Customer says "Yes, retry it." -> records retry_requested outcome
[PASS] GET /api/customers/CUST001 reflects latest outcome "retry_requested"
[PASS] GET /api/calls/CUST001 returns complete transcript with agent and customer turns
[TwilioService] [SIMULATION MODE] Outbound call simulated for Priya Mehta (+919876543211). SID: SIM_1790963312770_CGYV0S
[WebhookController] POST /api/webhooks/voice/input - CustomerId: CUST002, CallSid: SIM_1790963312770_CGYV0S
[WebhookController] SpeechResult: "No, I'll pay manually through netbanking."
[CallService] Customer 'Priya Mehta' said: "No, I'll pay manually through netbanking."
[CallService] Agent response: "Understood. We have recorded that you will make a manual payment. Please complete the payment before your due date. Thank you, goodbye." (Outcome: manual_payment, EndCall: true)
[PASS] Intent Test: Priya Mehta (CUST002) chooses "I'll pay manually" -> manual_payment
[TwilioService] [SIMULATION MODE] Outbound call simulated for Amit Kumar (+919876543212). SID: SIM_1790963312778_ENK45T
[WebhookController] POST /api/webhooks/voice/input - CustomerId: CUST003, CallSid: SIM_1790963312778_ENK45T
[WebhookController] SpeechResult: "I am driving right now, please call me back later."
[CallService] Customer 'Amit Kumar' said: "I am driving right now, please call me back later."
[CallService] Agent response: "Understood. We have logged a callback request for you. Our team will reach out at a convenient time. Goodbye." (Outcome: callback_requested, EndCall: true)
[PASS] Intent Test: Amit Kumar (CUST003) asks "Call me back later" -> callback_requested

=================================================
Total Tests: 13 | Passed: 13 | Failed: 0
=================================================
```

---

## Running the Application

### Development Mode (with hot-reload)
```bash
npm run dev
```

### Production Mode
```bash
npm run build
npm start
```

Open your browser to:
```
http://localhost:3000
```

---

## Exposing Local Webhooks (ngrok)

For real Twilio outbound phone calls, Twilio must be able to hit your local Express server webhooks via an HTTPS URL.

1. **Start ngrok:**
   ```bash
   ngrok http 3000
   ```
2. **Copy the forwarding URL** (e.g., `https://abc-123.ngrok-free.app`).
3. **Update `BASE_URL` in `.env`:**
   ```env
   BASE_URL=https://abc-123.ngrok-free.app
   ```
4. **Restart the server** so the new `BASE_URL` is active.

---

## Configuring Twilio

1. Create a free account at [twilio.com](https://www.twilio.com).
2. Obtain a Twilio Voice-capable phone number.
3. In Twilio Console:
   - Copy **Account SID** &rarr; `TWILIO_ACCOUNT_SID`
   - Copy **Auth Token** &rarr; `TWILIO_AUTH_TOKEN`
   - Copy **Twilio Phone Number** &rarr; `TWILIO_PHONE_NUMBER`
4. Add your personal phone number to **Verified Caller IDs** in Twilio (required for trial accounts).
5. Set `AUTHORIZED_TEST_PHONE_NUMBER` in `.env` to your verified number.

---

## Configuring Google Gemini

1. Visit [Google AI Studio](https://aistudio.google.com/).
2. Click **Create API Key**.
3. Add the key to `.env`:
   ```env
   GEMINI_API_KEY=AIzaSyYourActualGeminiApiKey
   GEMINI_MODEL=gemini-1.5-flash
   ```

---

## 10 Fictional Customer Dataset

The system includes 10 realistic fictional customer accounts stored in [src/data/customers.json](src/data/customers.json):

| ID | Name | Amount Due | Due Date | Autopay Status | Initial Outcome |
|---|---|---|---|---|---|
| `CUST001` | Rahul Sharma | ₹1,499 | 2026-10-05 | Failed | Pending |
| `CUST002` | Priya Mehta | ₹899 | 2026-10-06 | Failed | Pending |
| `CUST003` | Amit Kumar | ₹2,199 | 2026-10-04 | Failed | Pending |
| `CUST004` | Ananya Iyer | ₹3,450 | 2026-10-07 | Failed | Pending |
| `CUST005` | Vikram Patel | ₹599 | 2026-10-03 | Failed | Pending |
| `CUST006` | Sneha Reddy | ₹4,200 | 2026-10-08 | Failed | Pending |
| `CUST007` | Rohan Verma | ₹1,250 | 2026-10-05 | Failed | Pending |
| `CUST008` | Deepa Nair | ₹1,899 | 2026-10-09 | Failed | Pending |
| `CUST009` | Kunal Joshi | ₹2,750 | 2026-10-04 | Failed | Pending |
| `CUST010` | Pooja Singh | ₹999 | 2026-10-06 | Failed | Pending |

---

## How to Run a Test Call

### Method 1: Live Telephony Call via Twilio
1. Ensure `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`, and `BASE_URL` (ngrok) are set in `.env`.
2. Set `AUTHORIZED_TEST_PHONE_NUMBER` to your verified mobile number.
3. Open `http://localhost:3000`.
4. Select **Rahul Sharma** (`CUST001`).
5. Click **"Call Customer"**.
6. Your physical phone will ring. Answer it and speak naturally:
   - *"Why did it fail?"* &rarr; Agent explains.
   - *"Yes, retry it."* &rarr; Agent acknowledges your retry request and clearly states no payment was processed by this demo.
7. Observe the dashboard table and transcript feed update immediately.

### Method 2: Interactive In-Browser Turn Simulator (Zero Telephony Needed)
1. Open `http://localhost:3000`.
2. Select any customer (e.g. **Priya Mehta**).
3. Click **"Call Customer"**.
4. Use the quick reply chips:
   - Click `"How much do I owe?"`
   - Click `"No, I'll pay manually."`
5. The live turn-by-turn chat transcript immediately updates with agent speech bubbles, and the outcome badge updates to `Manual Payment`.

---

## Example Conversation Flow

```text
AGENT:    "Hi Rahul, this is an automated payment assistant calling regarding your upcoming payment of ₹1,499. Your autopay attempt was unsuccessful. Would you like to retry the payment?"
CUSTOMER: "Why did it fail?"
AGENT:    "The previous autopay attempt was unsuccessful with your bank account. Would you like us to initiate a retry for ₹1,499?"
CUSTOMER: "How much do I owe?"
AGENT:    "Your total amount due is ₹1,499, due on 2026-10-05. Would you like to retry the autopay payment now?"
CUSTOMER: "Yes, retry it."
AGENT:    "Thanks, Rahul. I've recorded your request to retry the autopay for ₹1,499. No payment has been processed by this demo. Goodbye!"
[Call Status: completed | Outcome: retry_requested | Dashboard updated]
```

---

## Example API Requests

### 1. List Customers
```bash
curl -X GET http://localhost:3000/api/customers
```

### 2. Get Single Customer
```bash
curl -X GET http://localhost:3000/api/customers/CUST001
```

### 3. Initiate Outbound Call
```bash
curl -X POST http://localhost:3000/api/calls/CUST001
```

### 4. Fetch Call History & Transcripts
```bash
curl -X GET http://localhost:3000/api/calls/CUST001
```

### 5. Webhook Initial Voice (TwiML)
```bash
curl -X POST "http://localhost:3000/api/webhooks/voice?customerId=CUST001" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "CallSid=CA1234567890"
```

### 6. Webhook Speech Input (Simulate Customer Response)
```bash
curl -X POST "http://localhost:3000/api/webhooks/voice/input?customerId=CUST001" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "CallSid=CA1234567890&SpeechResult=Yes,%20retry%20it."
```

---

## Security Assumptions & Guardrails

- **Zero Exposure of Secrets:** API keys and authentication tokens are kept strictly in `.env` and never logged or serialized to client responses.
- **Authorized Test Number Guardrail:** Outbound calls strictly override fictional phone numbers with `AUTHORIZED_TEST_PHONE_NUMBER` when set, ensuring no arbitrary or real unsuspecting individuals can ever be contacted.
- **Fixed Persona Context:** The LLM prompt explicitly restricts the agent to provided customer data, preventing payment fabrication or hallucinated transaction confirmations.
- **Input Validation:** Customer IDs, phone numbers, and webhook bodies are validated before processing.

---

## Known Limitations

- **Simulated Recovery Action:** This assignment is a prototype demonstration of voice outreach and intent capture; it does not trigger live banking debit APIs.
- **Telephony Network Latency:** Speech recognition latency depends on the telephony carrier and Twilio's cloud transcription speed.
- **Environment Isolation:** Customer records are stored in a local JSON repository rather than a distributed database cluster (kept intentionally simple per assignment instructions).
- **Trial Account Restrictions:** Free Twilio trial accounts require all destination numbers to be pre-verified before dialing.
