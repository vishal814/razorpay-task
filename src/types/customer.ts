export type AutopayStatus = 'failed' | 'overdue' | 'pending';

export type CallOutcome =
  | 'retry_requested'
  | 'manual_payment'
  | 'declined'
  | 'callback_requested'
  | 'no_response'
  | 'unknown';

export interface Customer {
  id: string;
  name: string;
  phone: string;
  amountDue: number;
  dueDate: string;
  autopayStatus: AutopayStatus;
  latestOutcome?: CallOutcome | null;
  latestCallSid?: string | null;
  lastContactedAt?: string | null;
}
