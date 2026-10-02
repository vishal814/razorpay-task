import { Request, Response } from 'express';
import { callService } from '../services/callService.js';
import { twilioService } from '../services/twilioService.js';

export class WebhookController {
  /**
   * POST /api/webhooks/voice - Initial webhook when outbound call is answered
   */
  public handleVoice(req: Request, res: Response): void {
    try {
      const customerId = (req.query.customerId as string) || (req.body.customerId as string) || '';
      const callSid = req.body.CallSid || (req.query.CallSid as string) || `SIM_${Date.now()}`;

      console.log(`[WebhookController] POST /api/webhooks/voice - CustomerId: ${customerId}, CallSid: ${callSid}`);

      if (!customerId) {
        res.type('text/xml');
        res.send(twilioService.generateErrorTwiML());
        return;
      }

      const twiml = callService.handleInitialVoice(customerId, callSid);
      res.type('text/xml');
      res.send(twiml);
    } catch (err: any) {
      console.error('[WebhookController] handleVoice error:', err);
      res.type('text/xml');
      res.send(twilioService.generateErrorTwiML());
    }
  }

  /**
   * POST /api/webhooks/voice/input - Receives customer speech transcription from Twilio
   */
  public async handleVoiceInput(req: Request, res: Response): Promise<void> {
    try {
      const customerId = (req.query.customerId as string) || (req.body.customerId as string) || '';
      const callSid = req.body.CallSid || (req.query.CallSid as string) || '';
      const speechResult = req.body.SpeechResult || '';

      console.log(`[WebhookController] POST /api/webhooks/voice/input - CustomerId: ${customerId}, CallSid: ${callSid}`);
      console.log(`[WebhookController] SpeechResult: "${speechResult}"`);

      if (!customerId || !callSid) {
        res.type('text/xml');
        res.send(twilioService.generateErrorTwiML());
        return;
      }

      const twiml = await callService.handleVoiceInput(customerId, callSid, speechResult);
      res.type('text/xml');
      res.send(twiml);
    } catch (err: any) {
      console.error('[WebhookController] handleVoiceInput error:', err);
      res.type('text/xml');
      res.send(twilioService.generateErrorTwiML());
    }
  }

  /**
   * POST /api/webhooks/voice/status - Status callback updates from Twilio
   */
  public handleVoiceStatus(req: Request, res: Response): void {
    try {
      const customerId = (req.query.customerId as string) || (req.body.customerId as string) || '';
      const callSid = req.body.CallSid || '';
      const callStatus = req.body.CallStatus || '';
      const duration = req.body.CallDuration || req.body.Duration;

      console.log(`[WebhookController] POST /api/webhooks/voice/status - CustomerId: ${customerId}, CallSid: ${callSid}, Status: ${callStatus}`);

      if (callSid) {
        callService.handleCallStatus(customerId, callSid, callStatus, duration);
      }

      res.status(200).send('<Response></Response>');
    } catch (err: any) {
      console.error('[WebhookController] handleVoiceStatus error:', err);
      res.status(200).send('<Response></Response>');
    }
  }
}

export const webhookController = new WebhookController();
