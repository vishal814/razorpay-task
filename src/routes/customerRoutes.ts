import { Router } from 'express';
import { customerController } from '../controllers/customerController.js';

const router = Router();

// GET /api/customers - List all 10 fictional customers
router.get('/', (req, res) => customerController.getAll(req, res));

// GET /api/customers/:id - Retrieve single customer
router.get('/:id', (req, res) => customerController.getById(req, res));

// PATCH /api/customers/:id/phone - Update phone number for testing/demo safety
router.patch('/:id/phone', (req, res) => customerController.updatePhone(req, res));

export default router;
