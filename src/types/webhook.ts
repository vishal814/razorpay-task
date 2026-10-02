export interface TwilioVoiceWebhookPayload {
  CallSid: string;
  AccountSid?: string;
  From?: string;
  To?: string;
  CallStatus?: string;
  ApiVersion?: string;
  Direction?: string;
  ForwardedFrom?: string;
  CallerName?: string;
  [key: string]: string | undefined;
}

export interface TwilioVoiceInputPayload extends TwilioVoiceWebhookPayload {
  SpeechResult?: string;
  Confidence?: string;
  Digits?: string;
}

export interface TwilioStatusWebhookPayload extends TwilioVoiceWebhookPayload {
  CallDuration?: string;
  Duration?: string;
  RecordingUrl?: string;
  SequenceNumber?: string;
}
