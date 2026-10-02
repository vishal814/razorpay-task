import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../config/env.js';
import { Customer, CallOutcome } from '../types/customer.js';
import { TranscriptEntry } from '../types/call.js';

export interface GeminiResponse {
  spokenResponse: string;
  outcome: CallOutcome | null;
  shouldEndCall: boolean;
}

export class GeminiService {
  private genAI: GoogleGenerativeAI | null = null;

  constructor() {
    if (config.gemini.isConfigured) {
      this.genAI = new GoogleGenerativeAI(config.gemini.apiKey);
    }
  }

  /**
   * Generates a conversational response and extracts customer intent/outcome
   */
  public async generateResponse(
    customer: Customer,
    transcript: TranscriptEntry[],
    latestCustomerInput: string
  ): Promise<GeminiResponse> {
    // If Gemini is configured, use live LLM
    if (this.genAI) {
      try {
        return await this.callGeminiModel(customer, transcript, latestCustomerInput);
      } catch (err: any) {
        console.error('[GeminiService] Live Gemini API error, falling back to rule engine:', err?.message || err);
        return this.ruleBasedFallback(customer, latestCustomerInput);
      }
    }

    // Deterministic fallback if Gemini API key is missing/unconfigured
    return this.ruleBasedFallback(customer, latestCustomerInput);
  }

  private async callGeminiModel(
    customer: Customer,
    transcript: TranscriptEntry[],
    latestCustomerInput: string
  ): Promise<GeminiResponse> {
    if (!this.genAI) throw new Error('Gemini API not configured');

    const formattedAmount = `₹${customer.amountDue.toLocaleString('en-IN')}`;

    const systemPrompt = `You are an automated autopay recovery assistant.
Your job is to have a short, polite conversation with a customer regarding an unsuccessful autopay attempt.

Customer:
Name: ${customer.name}
Amount Due: ${formattedAmount}
Due Date: ${customer.dueDate}
Autopay Status: ${customer.autopayStatus}

Goals:
1. Explain why you are calling.
2. Answer basic questions using only the provided customer information.
3. Determine whether the customer wants to retry autopay, pay manually, decline, or request a callback.
4. Never invent payment information.
5. Never claim that payment was processed or completed. Clarify that you have recorded their request to retry, but no payment has been processed by this demo.
6. Keep responses short and natural for a phone conversation.

Handling customer intents:
- If customer agrees to retry autopay (e.g. "yes", "retry it", "try again", "go ahead"):
  Acknowledge politely with: "Thanks, ${customer.name}. I've recorded your request to retry the autopay for ${formattedAmount}. No payment has been processed by this demo. Goodbye!", set outcome to "retry_requested" and shouldEndCall to true.
- If customer says they will pay manually (e.g. "I'll pay manually", "pay myself", "netbanking", "UPI later"):
  Acknowledge politely and set outcome to "manual_payment" and shouldEndCall to true.
- If customer declines (e.g. "no", "not interested", "don't want to pay"):
  Acknowledge politely and set outcome to "declined" and shouldEndCall to true.
- If customer asks for a callback (e.g. "call me back", "busy right now", "call later"):
  Acknowledge politely, confirm a callback request, set outcome to "callback_requested" and shouldEndCall to true.
- If customer asks why it failed (e.g. "why did it fail?", "what happened?"):
  Explain that the previous autopay attempt was unsuccessful with their bank, and ask whether they would like to retry. Outcome is null and shouldEndCall is false.
- If customer asks how much they owe (e.g. "how much do I owe?", "what is the amount?"):
  State their exact amount due (${formattedAmount}) and ask whether they would like to retry now. Outcome is null and shouldEndCall is false.
- If customer response is unclear, off-topic, or garbled:
  Politely repeat or rephrase the question rather than hallucinate. Outcome is null and shouldEndCall is false.

RESPONSE FORMAT:
You MUST output ONLY a valid JSON object without markdown code blocks, with this exact schema:
{
  "spokenResponse": "Short spoken response text to speak to the customer (maximum 2 sentences)",
  "outcome": "retry_requested" | "manual_payment" | "declined" | "callback_requested" | "unknown" | null,
  "shouldEndCall": true | false
}`;

    // Format conversation history
    const historyText = transcript
      .map((entry) => `${entry.speaker.toUpperCase()}: ${entry.text}`)
      .join('\n');

    const userPrompt = `Conversation History:
${historyText || '(Beginning of conversation)'}
CUSTOMER: ${latestCustomerInput}

Respond with the JSON object for the next agent turn:`;

    const model = this.genAI.getGenerativeModel({
      model: config.gemini.model,
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json',
      },
      systemInstruction: systemPrompt,
    });

    const result = await model.generateContent(userPrompt);
    const responseText = result.response.text().trim();

    // Clean JSON if needed
    const cleanedJson = responseText.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
    const parsed = JSON.parse(cleanedJson);

    return {
      spokenResponse: parsed.spokenResponse || 'Thank you for your time. Goodbye.',
      outcome: this.sanitizeOutcome(parsed.outcome),
      shouldEndCall: Boolean(parsed.shouldEndCall),
    };
  }

  /**
   * Deterministic rule-based fallback if Gemini API is offline or unconfigured.
   * Fully satisfies Core User Flow Requirements (5.A - 5.G).
   */
  public ruleBasedFallback(customer: Customer, input: string): GeminiResponse {
    const text = (input || '').toLowerCase().trim();
    const formattedAmount = `₹${customer.amountDue.toLocaleString('en-IN')}`;

    // 5.E: Customer asks for amount
    if (text.includes('how much') || text.includes('amount') || text.includes('owe') || text.includes('balance')) {
      return {
        spokenResponse: `Your total amount due is ${formattedAmount}, due on ${customer.dueDate}. Would you like to retry the autopay payment now?`,
        outcome: null,
        shouldEndCall: false,
      };
    }

    // 5.D: Customer asks why it failed
    if (text.includes('why') || text.includes('reason') || text.includes('what happened') || text.includes('failed')) {
      return {
        spokenResponse: `The previous autopay attempt was unsuccessful with your bank account. Would you like us to initiate a retry for ${formattedAmount}?`,
        outcome: null,
        shouldEndCall: false,
      };
    }

    // 5.F: Customer asks for a callback
    if (text.includes('callback') || text.includes('call back') || text.includes('call me later') || text.includes('busy right now') || text.includes('later')) {
      return {
        spokenResponse: 'Understood. We have logged a callback request for you. Our team will reach out at a convenient time. Goodbye.',
        outcome: 'callback_requested',
        shouldEndCall: true,
      };
    }

    // 5.B: Customer wants manual payment
    if (text.includes('manual') || text.includes('pay manually') || text.includes('pay myself') || text.includes('myself') || text.includes('netbanking') || text.includes('app')) {
      return {
        spokenResponse: 'Understood. We have recorded that you will make a manual payment. Please complete the payment before your due date. Thank you, goodbye.',
        outcome: 'manual_payment',
        shouldEndCall: true,
      };
    }

    // 5.A: Customer wants to retry
    if (
      text.includes('yes') ||
      text.includes('retry') ||
      text.includes('try again') ||
      text.includes('go ahead') ||
      text.includes('please do') ||
      text.includes('sure') ||
      text === 'ok' ||
      text === 'okay'
    ) {
      return {
        spokenResponse: `Thanks, ${customer.name}. I've recorded your request to retry the autopay for ${formattedAmount}. No payment has been processed by this demo. Goodbye!`,
        outcome: 'retry_requested',
        shouldEndCall: true,
      };
    }

    // 5.C: Customer declines
    if (text.startsWith('no') || text.includes('dont want') || text.includes("don't want") || text.includes('decline') || text.includes('cancel')) {
      return {
        spokenResponse: 'Understood. We have recorded your response. Please note that late charges may apply if payment remains overdue. Thank you, goodbye.',
        outcome: 'declined',
        shouldEndCall: true,
      };
    }

    // 5.G: Customer gives an unclear response
    return {
      spokenResponse: `I'm sorry, I didn't quite catch that. Your autopay for ${formattedAmount} was unsuccessful. Would you like to retry the payment now, pay manually, or request a callback?`,
      outcome: null,
      shouldEndCall: false,
    };
  }

  private sanitizeOutcome(val: any): CallOutcome | null {
    const validOutcomes: CallOutcome[] = [
      'retry_requested',
      'manual_payment',
      'declined',
      'callback_requested',
      'no_response',
      'unknown',
    ];
    if (validOutcomes.includes(val)) {
      return val;
    }
    return null;
  }
}

export const geminiService = new GeminiService();
