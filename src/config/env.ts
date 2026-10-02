import dotenv from 'dotenv';
dotenv.config();

export interface AppConfig {
  port: number;
  nodeEnv: string;
  baseUrl: string;
  twilio: {
    accountSid: string;
    authToken: string;
    phoneNumber: string;
    isConfigured: boolean;
  };
  gemini: {
    apiKey: string;
    model: string;
    isConfigured: boolean;
  };
  authorizedTestPhoneNumber?: string;
}

const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim() || '';
const authToken = process.env.TWILIO_AUTH_TOKEN?.trim() || '';
const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER?.trim() || '';
const geminiApiKey = process.env.GEMINI_API_KEY?.trim() || '';

const isTwilioConfigured = Boolean(
  accountSid &&
  accountSid.startsWith('AC') &&
  authToken &&
  twilioPhoneNumber
);

const isGeminiConfigured = Boolean(
  geminiApiKey &&
  geminiApiKey.length > 10 &&
  !geminiApiKey.includes('your_gemini_api_key')
);

export const config: AppConfig = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  baseUrl: (process.env.BASE_URL || 'http://localhost:3000').replace(/\/+$/, ''),
  twilio: {
    accountSid,
    authToken,
    phoneNumber: twilioPhoneNumber,
    isConfigured: isTwilioConfigured,
  },
  gemini: {
    apiKey: geminiApiKey,
    model: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
    isConfigured: isGeminiConfigured,
  },
  authorizedTestPhoneNumber: process.env.AUTHORIZED_TEST_PHONE_NUMBER?.trim() || undefined,
};

// Safe config summary logger (Never exposes secrets)
export function logConfigSummary(): void {
  console.log('----------------------------------------------------');
  console.log('[Server] Autopay Recovery Voice Agent Initializing');
  console.log(`[Config] Port:               ${config.port}`);
  console.log(`[Config] Base URL:           ${config.baseUrl}`);
  console.log(`[Config] Twilio Configured:  ${config.twilio.isConfigured ? 'YES (Live Telephony Ready)' : 'NO (Missing/Dummy Credentials)'}`);
  console.log(`[Config] Gemini Configured:  ${config.gemini.isConfigured ? `YES (Model: ${config.gemini.model})` : 'NO (Missing/Dummy API Key)'}`);
  if (config.authorizedTestPhoneNumber) {
    console.log(`[Security] Test Call Override: Active -> Will call ${config.authorizedTestPhoneNumber}`);
  }
  console.log('----------------------------------------------------');
}
