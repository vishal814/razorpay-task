import { Router } from 'express';
import { callController } from '../controllers/callController.js';

const router = Router();

// POST /api/calls/simulate-turn - Simulator helper for interactive web testing (must be before :customerId)
router.post('/simulate-turn', (req, res) => callController.simulateTurn(req, res));

// GET /api/calls/sid/:callSid - Get specific call record (must be before :customerId)
router.get('/sid/:callSid', (req, res) => callController.getCallBySid(req, res));

// POST /api/calls/:customerId - Initiate outbound voice call
router.post('/:customerId', (req, res) => callController.initiateCall(req, res));

// GET /api/calls/:customerId - Get all calls and transcripts for a customer
router.get('/:customerId', (req, res) => callController.getCallsByCustomerId(req, res));

export default router;
