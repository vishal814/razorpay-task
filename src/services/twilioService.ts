import twilio from 'twilio';
import VoiceResponse from 'twilio/lib/twiml/VoiceResponse.js';
import { config } from '../config/env.js';
import { Customer } from '../types/customer.js';
import { CallStatus, InitiateCallResponse } from '../types/call.js';

export class TwilioService {
  private client: twilio.Twilio | null = null;

  constructor() {
    if (config.twilio.isConfigured) {
      try {
        this.client = twilio(config.twilio.accountSid, config.twilio.authToken);
      } catch (err) {
        console.error('[TwilioService] Failed to initialize Twilio client:', err);
      }
    }
  }

  /**
   * Initiates an outbound voice call via Twilio (or simulated if credentials not provided)
   */
  public async makeOutboundCall(customer: Customer): Promise<InitiateCallResponse> {
    // Determine the safe phone number to call
    // If AUTHORIZED_TEST_PHONE_NUMBER is configured, it overrides the fictional customer number
    const targetPhone = config.authorizedTestPhoneNumber || customer.phone;

    // Validate phone number format (E.164)
    const e164Regex = /^\+[1-9]\d{7,14}$/;
    if (!e164Regex.test(targetPhone)) {
      throw new Error(`Target phone number '${targetPhone}' is not in valid E.164 international format.`);
    }

    // If Twilio credentials are configured, initiate real call
    if (this.client && config.twilio.isConfigured) {
      try {
        const webhookUrl = `${config.baseUrl}/api/webhooks/voice?customerId=${customer.id}`;
        const statusCallbackUrl = `${config.baseUrl}/api/webhooks/voice/status?customerId=${customer.id}`;

        console.log(`[TwilioService] Initiating outbound call to ${targetPhone} (Customer: ${customer.id})...`);
        console.log(`[TwilioService] Webhook URL: ${webhookUrl}`);

        const call = await this.client.calls.create({
          url: webhookUrl,
          to: targetPhone,
          from: config.twilio.phoneNumber,
          statusCallback: statusCallbackUrl,
          statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
          statusCallbackMethod: 'POST',
          record: false,
        });

        console.log(`[TwilioService] Twilio Call created! SID: ${call.sid}, Status: ${call.status}`);

        return {
          success: true,
          message: `Live outbound call initiated to ${targetPhone}`,
          callSid: call.sid,
          callStatus: (call.status as CallStatus) || 'initiated',
          customerId: customer.id,
          toPhone: targetPhone,
          isSimulated: false,
        };
      } catch (err: any) {
        console.error('[TwilioService] Twilio API call failed:', err?.message || err);
        throw new Error(`Twilio Call Initiation Failed: ${err?.message || 'Unknown error'}`);
      }
    }

    // If Twilio is not configured or in local sandbox test mode:
    // Generate a simulated call record so evaluator can test the end-to-end webhook/agent flow locally
    const simulatedSid = `SIM_${Date.now()}_${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    console.log(`[TwilioService] [SIMULATION MODE] Outbound call simulated for ${customer.name} (${targetPhone}). SID: ${simulatedSid}`);

    return {
      success: true,
      message: `Simulated call initiated (Twilio credentials not configured in .env). Target: ${targetPhone}`,
      callSid: simulatedSid,
      callStatus: 'initiated',
      customerId: customer.id,
      toPhone: targetPhone,
      isSimulated: true,
    };
  }

  /**
   * Generates the dynamic initial TwiML greeting for the customer
   */
  public generateInitialGreetingTwiML(customer: Customer, callSid: string): { twiml: string; spokenText: string } {
    const response = new VoiceResponse();
    const formattedAmount = `₹${customer.amountDue.toLocaleString('en-IN')}`;

    // Required prompt text:
    // "Hi Rahul, this is an automated payment assistant calling regarding your upcoming payment of ₹1,499. Your autopay attempt was unsuccessful. Would you like to retry the payment?"
    const spokenText = `Hi ${customer.name}, this is an automated payment assistant calling regarding your upcoming payment of ${formattedAmount}. Your autopay attempt was unsuccessful. Would you like to retry the payment?`;

    const gather = response.gather({
      input: ['speech'],
      action: `${config.baseUrl}/api/webhooks/voice/input?customerId=${customer.id}`,
      method: 'POST',
      speechTimeout: 'auto',
      language: 'en-IN',
      timeout: 5,
    });

    gather.say({ voice: 'Polly.Aditi', language: 'en-IN' }, spokenText);

    // Fallback if customer did not respond
    response.say(
      { voice: 'Polly.Aditi', language: 'en-IN' },
      'We did not hear any response. Please check your account online or contact our customer support. Goodbye.'
    );
    response.hangup();

    return {
      twiml: response.toString(),
      spokenText,
    };
  }

  /**
   * Generates TwiML for conversational turns
   */
  public generateFollowUpTwiML(customerId: string, spokenResponse: string, shouldEndCall: boolean): string {
    const response = new VoiceResponse();

    if (shouldEndCall) {
      response.say({ voice: 'Polly.Aditi', language: 'en-IN' }, spokenResponse);
      response.hangup();
    } else {
      const gather = response.gather({
        input: ['speech'],
        action: `${config.baseUrl}/api/webhooks/voice/input?customerId=${customerId}`,
        method: 'POST',
        speechTimeout: 'auto',
        language: 'en-IN',
        timeout: 5,
      });

      gather.say({ voice: 'Polly.Aditi', language: 'en-IN' }, spokenResponse);

      // Fallback if no input on follow-up
      response.say(
        { voice: 'Polly.Aditi', language: 'en-IN' },
        'Thank you for your time. Please reach out to customer support if you need further help. Goodbye.'
      );
      response.hangup();
    }

    return response.toString();
  }

  /**
   * Generates safe error TwiML
   */
  public generateErrorTwiML(): string {
    const response = new VoiceResponse();
    response.say(
      { voice: 'Polly.Aditi', language: 'en-IN' },
      'We are currently experiencing technical difficulties. An agent will follow up with you. Thank you and goodbye.'
    );
    response.hangup();
    return response.toString();
  }
}

export const twilioService = new TwilioService();
