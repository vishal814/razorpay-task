import { Request, Response } from 'express';
import { customerRepository } from '../repositories/customerRepository.js';

export class CustomerController {
  public getAll(req: Request, res: Response): void {
    try {
      const customers = customerRepository.getAll();
      res.json({
        success: true,
        count: customers.length,
        data: customers,
      });
    } catch (err: any) {
      console.error('[CustomerController] Error in getAll:', err);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch customers',
      });
    }
  }

  public getById(req: Request, res: Response): void {
    try {
      const id = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) || '';
      if (!id) {
        res.status(400).json({
          success: false,
          error: 'Customer ID is required',
        });
        return;
      }

      const customer = customerRepository.getById(id);
      if (!customer) {
        res.status(404).json({
          success: false,
          error: `Customer with ID '${id}' not found`,
        });
        return;
      }

      res.json({
        success: true,
        data: customer,
      });
    } catch (err: any) {
      console.error(`[CustomerController] Error in getById:`, err);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch customer details',
      });
    }
  }

  public updatePhone(req: Request, res: Response): void {
    try {
      const id = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) || '';
      const { phone } = req.body;

      if (!id || !phone || typeof phone !== 'string') {
        res.status(400).json({
          success: false,
          error: 'Customer ID and valid phone string are required',
        });
        return;
      }

      // Basic E.164 phone format validation
      const e164Regex = /^\+[1-9]\d{7,14}$/;
      if (!e164Regex.test(phone.trim())) {
        res.status(400).json({
          success: false,
          error: 'Phone number must be in E.164 format (e.g. +919876543210)',
        });
        return;
      }

      const updated = customerRepository.updatePhone(id, phone.trim());
      if (!updated) {
        res.status(404).json({
          success: false,
          error: `Customer with ID '${id}' not found`,
        });
        return;
      }

      res.json({
        success: true,
        message: `Phone number updated for customer ${id}`,
        data: updated,
      });
    } catch (err: any) {
      console.error(`[CustomerController] Error in updatePhone:`, err);
      res.status(500).json({
        success: false,
        error: 'Failed to update customer phone number',
      });
    }
  }
}

export const customerController = new CustomerController();
