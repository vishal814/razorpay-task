import { Request, Response } from 'express';
import { callService } from '../services/callService.js';

export class CallController {
  /**
   * POST /api/calls/:customerId - Initiates an outbound voice call
   */
  public async initiateCall(req: Request, res: Response): Promise<void> {
    try {
      const customerId = (Array.isArray(req.params.customerId) ? req.params.customerId[0] : req.params.customerId) || '';
      if (!customerId) {
        res.status(400).json({
          success: false,
          error: 'Customer ID is required',
        });
        return;
      }

      const result = await callService.initiateCall(customerId);
      res.status(200).json(result);
    } catch (err: any) {
      console.error('[CallController] initiateCall error:', err?.message || err);
      const isNotFound = err?.message?.includes('does not exist');
      res.status(isNotFound ? 404 : 500).json({
        success: false,
        error: err?.message || 'Failed to initiate call',
      });
    }
  }

  /**
   * GET /api/calls/:customerId - Retrieves all call records and transcripts for a customer
   */
  public getCallsByCustomerId(req: Request, res: Response): void {
    try {
      const customerId = (Array.isArray(req.params.customerId) ? req.params.customerId[0] : req.params.customerId) || '';
      if (!customerId) {
        res.status(400).json({
          success: false,
          error: 'Customer ID is required',
        });
        return;
      }

      const calls = callService.getCallsByCustomerId(customerId);
      res.json({
        success: true,
        customerId,
        count: calls.length,
        data: calls,
      });
    } catch (err: any) {
      console.error('[CallController] getCallsByCustomerId error:', err);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve call history',
      });
    }
  }

  /**
   * GET /api/calls/sid/:callSid - Retrieves specific call record
   */
  public getCallBySid(req: Request, res: Response): void {
    try {
      const callSid = (Array.isArray(req.params.callSid) ? req.params.callSid[0] : req.params.callSid) || '';
      const call = callService.getCallBySid(callSid);

      if (!call) {
        res.status(404).json({
          success: false,
          error: `Call with SID '${callSid}' not found`,
        });
        return;
      }

      res.json({
        success: true,
        data: call,
      });
    } catch (err: any) {
      console.error('[CallController] getCallBySid error:', err);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve call details',
      });
    }
  }

  /**
   * POST /api/calls/simulate-turn - Simulator endpoint allowing test speech input without telephony
   */
  public async simulateTurn(req: Request, res: Response): Promise<void> {
    try {
      const { customerId, callSid, speechResult } = req.body;
      if (!customerId || !callSid) {
        res.status(400).json({
          success: false,
          error: 'customerId and callSid are required',
        });
        return;
      }

      const twiml = await callService.handleVoiceInput(customerId, callSid, speechResult);
      const updatedCall = callService.getCallBySid(callSid);

      res.json({
        success: true,
        twiml,
        callRecord: updatedCall,
      });
    } catch (err: any) {
      console.error('[CallController] simulateTurn error:', err);
      res.status(500).json({
        success: false,
        error: 'Failed to process simulated voice turn',
      });
    }
  }
}

export const callController = new CallController();
