import { customerRepository } from '../repositories/customerRepository.js';
import { callRepository } from '../repositories/callRepository.js';
import { twilioService } from './twilioService.js';
import { geminiService } from './geminiService.js';
import { CallRecord, CallStatus, InitiateCallResponse } from '../types/call.js';
import { CallOutcome } from '../types/customer.js';

export class CallService {
  /**
   * Initiates an outbound voice call to the customer
   */
  public async initiateCall(customerId: string): Promise<InitiateCallResponse> {
    const customer = customerRepository.getById(customerId);
    if (!customer) {
      throw new Error(`Customer with ID '${customerId}' does not exist.`);
    }

    // Initiate call via Twilio (or simulation mode)
    const callResult = await twilioService.makeOutboundCall(customer);

    // Generate initial greeting dynamically using customer context
    const { spokenText } = twilioService.generateInitialGreetingTwiML(customer, callResult.callSid);

    // Create initial CallRecord with initial agent greeting
    callRepository.create({
      customerId: customer.id,
      callSid: callResult.callSid,
      startedAt: new Date().toISOString(),
      endedAt: null,
      transcript: [
        {
          speaker: 'agent',
          text: spokenText,
          timestamp: new Date().toISOString(),
        },
      ],
      outcome: 'unknown',
      callStatus: callResult.callStatus,
      notes: callResult.isSimulated ? 'Simulated call mode' : 'Live Twilio outbound call',
    });

    // Update customer's latest call metadata
    customerRepository.updateOutcome(customerId, 'unknown', callResult.callSid);

    return callResult;
  }

  /**
   * Handles the initial webhook hit when the call is answered by the customer
   */
  public handleInitialVoice(customerId: string, callSid: string): string {
    const customer = customerRepository.getById(customerId);
    if (!customer) {
      console.error(`[CallService] Initial voice webhook: Customer ${customerId} not found`);
      return twilioService.generateErrorTwiML();
    }

    // Generate initial greeting TwiML dynamically using customer context
    const { twiml, spokenText } = twilioService.generateInitialGreetingTwiML(customer, callSid);

    // Update call status and log initial agent speech to transcript
    let call = callRepository.getByCallSid(callSid);
    if (!call) {
      call = callRepository.create({
        customerId: customer.id,
        callSid,
        startedAt: new Date().toISOString(),
        endedAt: null,
        transcript: [
          {
            speaker: 'agent',
            text: spokenText,
            timestamp: new Date().toISOString(),
          },
        ],
        outcome: 'unknown',
        callStatus: 'in-progress',
      });
    } else {
      callRepository.updateStatus(callSid, 'in-progress');
      // If transcript was empty, add the spoken greeting
      if (call.transcript.length === 0) {
        callRepository.addTranscriptEntry(callSid, 'agent', spokenText);
      }
    }

    return twiml;
  }

  /**
   * Handles speech input from the customer during the call
   */
  public async handleVoiceInput(
    customerId: string,
    callSid: string,
    speechResult?: string
  ): Promise<string> {
    const customer = customerRepository.getById(customerId);
    if (!customer) {
      return twilioService.generateErrorTwiML();
    }

    let call = callRepository.getByCallSid(callSid);
    if (!call) {
      call = callRepository.create({
        customerId: customer.id,
        callSid,
        startedAt: new Date().toISOString(),
        endedAt: null,
        transcript: [],
        outcome: 'unknown',
        callStatus: 'in-progress',
      });
    }

    // Case 1: No speech detected (silence or timeout)
    if (!speechResult || speechResult.trim().length === 0) {
      console.log(`[CallService] No speech detected for customer ${customerId} (CallSid: ${callSid})`);
      const noResponseText = 'We did not receive any response. Please feel free to pay online or contact support. Goodbye.';
      callRepository.addTranscriptEntry(callSid, 'agent', noResponseText);
      callRepository.updateOutcome(callSid, 'no_response');
      customerRepository.updateOutcome(customerId, 'no_response', callSid);
      return twilioService.generateFollowUpTwiML(customerId, noResponseText, true);
    }

    const trimmedInput = speechResult.trim();
    console.log(`[CallService] Customer '${customer.name}' said: "${trimmedInput}"`);

    // Record customer utterance to transcript
    callRepository.addTranscriptEntry(callSid, 'customer', trimmedInput);

    // Get current transcript for LLM context
    const currentCall = callRepository.getByCallSid(callSid);
    const transcript = currentCall?.transcript || [];

    // Query Gemini LLM (with customer context & conversation history)
    const geminiResult = await geminiService.generateResponse(customer, transcript, trimmedInput);
    console.log(`[CallService] Agent response: "${geminiResult.spokenResponse}" (Outcome: ${geminiResult.outcome}, EndCall: ${geminiResult.shouldEndCall})`);

    // Record agent response to transcript
    callRepository.addTranscriptEntry(callSid, 'agent', geminiResult.spokenResponse);

    // Update outcome if determined
    if (geminiResult.outcome) {
      callRepository.updateOutcome(callSid, geminiResult.outcome);
      customerRepository.updateOutcome(customerId, geminiResult.outcome, callSid);
    }

    // If call is concluding, mark end time
    if (geminiResult.shouldEndCall) {
      callRepository.endCall(callSid, 'completed', geminiResult.outcome || undefined);
    }

    // Generate response TwiML
    return twilioService.generateFollowUpTwiML(
      customerId,
      geminiResult.spokenResponse,
      geminiResult.shouldEndCall
    );
  }

  /**
   * Handles call status callbacks from Twilio
   */
  public handleCallStatus(
    customerId: string,
    callSid: string,
    status: string,
    duration?: string
  ): void {
    console.log(`[CallService] Status callback: CallSid ${callSid} -> Status: ${status}, Duration: ${duration || 'N/A'}`);
    
    const callStatus = (status.toLowerCase() as CallStatus) || 'in-progress';
    const isTerminal = ['completed', 'failed', 'busy', 'no-answer', 'canceled'].includes(callStatus);

    if (isTerminal) {
      const call = callRepository.getByCallSid(callSid);
      let finalOutcome: CallOutcome | undefined = undefined;

      // If call ended without a clear outcome:
      if (!call || call.outcome === 'unknown') {
        if (callStatus === 'no-answer' || callStatus === 'busy') {
          finalOutcome = 'no_response';
        }
      }

      callRepository.endCall(callSid, callStatus, finalOutcome);
      if (finalOutcome) {
        customerRepository.updateOutcome(customerId, finalOutcome, callSid);
      }
    } else {
      callRepository.updateStatus(callSid, callStatus);
    }
  }

  /**
   * Fetch call records for a customer
   */
  public getCallsByCustomerId(customerId: string): CallRecord[] {
    return callRepository.getByCustomerId(customerId);
  }

  /**
   * Fetch a single call record by CallSid
   */
  public getCallBySid(callSid: string): CallRecord | undefined {
    return callRepository.getByCallSid(callSid);
  }

  /**
   * Get all call records
   */
  public getAllCalls(): CallRecord[] {
    return callRepository.getAll();
  }
}

export const callService = new CallService();
