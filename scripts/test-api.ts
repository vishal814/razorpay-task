import { createApp } from '../src/app.js';
import http from 'http';

async function runTests() {
  console.log('[TEST] Starting End-to-End API Verification Tests...\n');

  const app = createApp();
  const server = http.createServer(app);

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://localhost:${port}`;

  let passed = 0;
  let failed = 0;

  async function assert(desc: string, fn: () => Promise<boolean>) {
    try {
      const ok = await fn();
      if (ok) {
        console.log(`[PASS] ${desc}`);
        passed++;
      } else {
        console.error(`[FAIL] ${desc}`);
        failed++;
      }
    } catch (e: any) {
      console.error(`[ERROR] ${desc} -> ${e.message}`);
      failed++;
    }
  }

  // --- PHASE 1 & 2: Base & Customer Endpoints ---
  await assert('GET /api/health returns status ok', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    const data = await res.json();
    return res.status === 200 && data.status === 'ok';
  });

  await assert('GET /api/customers returns all 10 fictional customers', async () => {
    const res = await fetch(`${baseUrl}/api/customers`);
    const data = await res.json();
    return res.status === 200 && data.success === true && data.count === 10;
  });

  await assert('GET /api/customers/CUST001 returns Rahul Sharma with ₹1,499 due', async () => {
    const res = await fetch(`${baseUrl}/api/customers/CUST001`);
    const data = await res.json();
    return (
      res.status === 200 &&
      data.data.name === 'Rahul Sharma' &&
      data.data.amountDue === 1499 &&
      data.data.autopayStatus === 'failed'
    );
  });

  // --- PHASE 3: Outbound Calling API ---
  let activeCallSid = '';
  await assert('POST /api/calls/CUST001 initiates outbound call and returns callSid', async () => {
    const res = await fetch(`${baseUrl}/api/calls/CUST001`, { method: 'POST' });
    const data = await res.json();
    if (data.callSid) activeCallSid = data.callSid;
    return res.status === 200 && data.success === true && Boolean(data.callSid);
  });

  await assert('POST /api/calls/NON_EXISTENT returns 404', async () => {
    const res = await fetch(`${baseUrl}/api/calls/NON_EXISTENT`, { method: 'POST' });
    return res.status === 404;
  });

  // --- PHASE 4: Voice Webhook & Dynamic TwiML ---
  await assert('POST /api/webhooks/voice returns dynamic TwiML with customer name and amount', async () => {
    const params = new URLSearchParams({
      CallSid: activeCallSid,
    });
    const res = await fetch(`${baseUrl}/api/webhooks/voice?customerId=CUST001`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    const twiml = await res.text();
    const hasName = twiml.includes('Rahul');
    const hasAmount = twiml.includes('1,499');
    const hasGather = twiml.includes('<Gather');
    return res.status === 200 && hasName && hasAmount && hasGather;
  });

  // --- PHASE 5: Conversation Flow & Natural Language Intents ---

  // Test 5.E: Question about amount
  await assert('Webhook Input: Customer asks "How much do I owe?" -> returns exact amount and asks to retry', async () => {
    const params = new URLSearchParams({
      CallSid: activeCallSid,
      SpeechResult: 'How much do I owe?',
    });
    const res = await fetch(`${baseUrl}/api/webhooks/voice/input?customerId=CUST001`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    const twiml = await res.text();
    return res.status === 200 && twiml.includes('1,499') && twiml.includes('<Gather');
  });

  // Test 5.D: Question about why it failed
  await assert('Webhook Input: Customer asks "Why did it fail?" -> explains and asks to retry', async () => {
    const params = new URLSearchParams({
      CallSid: activeCallSid,
      SpeechResult: 'Why did it fail?',
    });
    const res = await fetch(`${baseUrl}/api/webhooks/voice/input?customerId=CUST001`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    const twiml = await res.text();
    return res.status === 200 && (twiml.toLowerCase().includes('unsuccessful') || twiml.toLowerCase().includes('failed'));
  });

  // Test 5.A: Customer says "Yes, retry it" -> Outcome retry_requested
  await assert('Webhook Input: Customer says "Yes, retry it." -> records retry_requested outcome', async () => {
    const params = new URLSearchParams({
      CallSid: activeCallSid,
      SpeechResult: 'Yes, retry it.',
    });
    const res = await fetch(`${baseUrl}/api/webhooks/voice/input?customerId=CUST001`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    const twiml = await res.text();
    const hasHangup = twiml.includes('<Hangup/>') || twiml.includes('<Hangup />');
    return res.status === 200 && hasHangup;
  });

  // --- PHASE 6: Transcript & Customer Outcome Persistence ---
  await assert('GET /api/customers/CUST001 reflects latest outcome "retry_requested"', async () => {
    const res = await fetch(`${baseUrl}/api/customers/CUST001`);
    const data = await res.json();
    return res.status === 200 && data.data.latestOutcome === 'retry_requested';
  });

  await assert('GET /api/calls/CUST001 returns complete transcript with agent and customer turns', async () => {
    const res = await fetch(`${baseUrl}/api/calls/CUST001`);
    const data = await res.json();
    const call = data.data[0];
    const hasTranscript = call && call.transcript && call.transcript.length >= 4;
    const hasCustomerSpeaker = call.transcript.some((t: any) => t.speaker === 'customer');
    const hasAgentSpeaker = call.transcript.some((t: any) => t.speaker === 'agent');
    return res.status === 200 && hasTranscript && hasCustomerSpeaker && hasAgentSpeaker;
  });

  // Test other intent outcomes (5.B, 5.C, 5.F) on other fictional customers
  await assert('Intent Test: Priya Mehta (CUST002) chooses "I\'ll pay manually" -> manual_payment', async () => {
    const callRes = await fetch(`${baseUrl}/api/calls/CUST002`, { method: 'POST' });
    const callData = await callRes.json();
    const sid = callData.callSid;

    const inputParams = new URLSearchParams({
      CallSid: sid,
      SpeechResult: "No, I'll pay manually through netbanking.",
    });
    await fetch(`${baseUrl}/api/webhooks/voice/input?customerId=CUST002`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: inputParams.toString(),
    });

    const custRes = await fetch(`${baseUrl}/api/customers/CUST002`);
    const custData = await custRes.json();
    return custData.data.latestOutcome === 'manual_payment';
  });

  await assert('Intent Test: Amit Kumar (CUST003) asks "Call me back later" -> callback_requested', async () => {
    const callRes = await fetch(`${baseUrl}/api/calls/CUST003`, { method: 'POST' });
    const callData = await callRes.json();
    const sid = callData.callSid;

    const inputParams = new URLSearchParams({
      CallSid: sid,
      SpeechResult: "I am driving right now, please call me back later.",
    });
    await fetch(`${baseUrl}/api/webhooks/voice/input?customerId=CUST003`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: inputParams.toString(),
    });

    const custRes = await fetch(`${baseUrl}/api/customers/CUST003`);
    const custData = await custRes.json();
    return custData.data.latestOutcome === 'callback_requested';
  });

  server.close();
  console.log(`\n=================================================`);
  console.log(`Total Tests: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
  console.log(`=================================================\n`);
  if (failed > 0) process.exit(1);
}

runTests();
