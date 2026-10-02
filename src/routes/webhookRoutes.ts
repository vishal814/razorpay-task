import { Router } from 'express';
import { webhookController } from '../controllers/webhookController.js';

const router = Router();

// POST /api/webhooks/voice - Initial call connection webhook
router.post('/voice', (req, res) => webhookController.handleVoice(req, res));
router.get('/voice', (req, res) => webhookController.handleVoice(req, res)); // Also support GET if testing in browser

// POST /api/webhooks/voice/input - Receives speech recognition output
router.post('/voice/input', (req, res) => webhookController.handleVoiceInput(req, res));

// POST /api/webhooks/voice/status - Call status events
router.post('/voice/status', (req, res) => webhookController.handleVoiceStatus(req, res));

export default router;
