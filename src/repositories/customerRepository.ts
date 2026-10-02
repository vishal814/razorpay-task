import fs from 'fs';
import path from 'path';
import { Customer, CallOutcome } from '../types/customer.js';

export class CustomerRepository {
  private customers: Map<string, Customer> = new Map();
  private filePath: string;

  constructor(customPath?: string) {
    this.filePath = customPath || path.resolve(process.cwd(), 'src/data/customers.json');
    this.loadCustomers();
  }

  private loadCustomers(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const parsed: Customer[] = JSON.parse(raw);
        this.customers.clear();
        for (const c of parsed) {
          this.customers.set(c.id, c);
        }
      } else {
        console.warn(`[CustomerRepository] File not found at ${this.filePath}, empty dataset initialized.`);
      }
    } catch (err) {
      console.error('[CustomerRepository] Error reading customer data:', err);
    }
  }

  private persist(): void {
    try {
      const data = Array.from(this.customers.values());
      fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      console.error('[CustomerRepository] Error persisting customers:', err);
    }
  }

  public getAll(): Customer[] {
    return Array.from(this.customers.values());
  }

  public getById(id: string): Customer | undefined {
    return this.customers.get(id);
  }

  public updateOutcome(id: string, outcome: CallOutcome, callSid?: string): Customer | undefined {
    const customer = this.customers.get(id);
    if (!customer) return undefined;

    customer.latestOutcome = outcome;
    if (callSid) customer.latestCallSid = callSid;
    customer.lastContactedAt = new Date().toISOString();

    this.customers.set(id, customer);
    this.persist();
    return customer;
  }

  public updatePhone(id: string, phone: string): Customer | undefined {
    const customer = this.customers.get(id);
    if (!customer) return undefined;

    customer.phone = phone;
    this.customers.set(id, customer);
    this.persist();
    return customer;
  }
}

export const customerRepository = new CustomerRepository();
