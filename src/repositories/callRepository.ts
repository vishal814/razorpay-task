import fs from 'fs';
import path from 'path';
import { CallRecord, CallStatus, TranscriptEntry } from '../types/call.js';
import { CallOutcome } from '../types/customer.js';

export class CallRepository {
  private calls: Map<string, CallRecord> = new Map(); // Keyed by callSid
  private filePath: string;

  constructor(customPath?: string) {
    this.filePath = customPath || path.resolve(process.cwd(), 'src/data/calls.json');
    this.loadCalls();
  }

  private loadCalls(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const parsed: CallRecord[] = JSON.parse(raw);
        this.calls.clear();
        for (const c of parsed) {
          this.calls.set(c.callSid, c);
        }
      }
    } catch (err) {
      console.error('[CallRepository] Error reading calls data:', err);
    }
  }

  private persist(): void {
    try {
      const data = Array.from(this.calls.values());
      fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      console.error('[CallRepository] Error persisting calls:', err);
    }
  }

  public create(call: Omit<CallRecord, 'id'>): CallRecord {
    const record: CallRecord = {
      ...call,
      id: `CALL_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    };
    this.calls.set(record.callSid, record);
    this.persist();
    return record;
  }

  public getByCallSid(callSid: string): CallRecord | undefined {
    return this.calls.get(callSid);
  }

  public getByCustomerId(customerId: string): CallRecord[] {
    return Array.from(this.calls.values())
      .filter((c) => c.customerId === customerId)
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  }

  public getAll(): CallRecord[] {
    return Array.from(this.calls.values())
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  }

  public addTranscriptEntry(
    callSid: string,
    speaker: 'agent' | 'customer' | 'system',
    text: string
  ): CallRecord | undefined {
    const call = this.calls.get(callSid);
    if (!call) return undefined;

    const entry: TranscriptEntry = {
      speaker,
      text,
      timestamp: new Date().toISOString(),
    };
    call.transcript.push(entry);
    this.persist();
    return call;
  }

  public updateOutcome(callSid: string, outcome: CallOutcome): CallRecord | undefined {
    const call = this.calls.get(callSid);
    if (!call) return undefined;

    call.outcome = outcome;
    this.persist();
    return call;
  }

  public updateStatus(callSid: string, status: CallStatus): CallRecord | undefined {
    const call = this.calls.get(callSid);
    if (!call) return undefined;

    call.callStatus = status;
    this.persist();
    return call;
  }

  public endCall(
    callSid: string,
    finalStatus?: CallStatus,
    finalOutcome?: CallOutcome
  ): CallRecord | undefined {
    const call = this.calls.get(callSid);
    if (!call) return undefined;

    call.endedAt = new Date().toISOString();
    if (finalStatus) call.callStatus = finalStatus;
    if (finalOutcome) call.outcome = finalOutcome;

    this.persist();
    return call;
  }
}

export const callRepository = new CallRepository();
