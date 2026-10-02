import { CallOutcome } from './customer.js';

export interface TranscriptEntry {
  speaker: 'agent' | 'customer' | 'system';
  text: string;
  timestamp: string;
}

export type CallStatus =
  | 'queued'
  | 'initiated'
  | 'ringing'
  | 'in-progress'
  | 'completed'
  | 'failed'
  | 'busy'
  | 'no-answer'
  | 'canceled';

export interface CallRecord {
  id: string; // Internal record ID
  customerId: string;
  callSid: string;
  startedAt: string;
  endedAt?: string | null;
  transcript: TranscriptEntry[];
  outcome: CallOutcome;
  callStatus: CallStatus;
  notes?: string;
}

export interface InitiateCallResponse {
  success: boolean;
  message: string;
  callSid: string;
  callStatus: CallStatus;
  customerId: string;
  toPhone: string;
  isSimulated?: boolean;
}
