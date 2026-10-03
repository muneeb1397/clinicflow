import express from 'express';
import { getSlots, bookSlot, saveIntake, checkInsurance } from '../services/toolService.js';

const router = express.Router();

// Helper handler to wrap async tool logic with 400 status error handling
function asyncHandler(fn) {
  return async (req, res) => {
    try {
      const args = { ...req.query, ...req.body };
      const result = await fn(args);
      res.json(result);
    } catch (err) {
      const statusCode = err.statusCode || 400;
      res.status(statusCode).json({ error: err.message || 'Tool execution failed' });
    }
  };
}

// 1. getSlots (GET or POST)
router.get('/getSlots', asyncHandler(getSlots));
router.post('/getSlots', asyncHandler(getSlots));

// 2. bookSlot (POST)
router.post('/bookSlot', asyncHandler(bookSlot));

// 3. saveIntake (POST)
router.post('/saveIntake', asyncHandler(saveIntake));

// 4. checkInsurance (POST)
router.post('/checkInsurance', asyncHandler(checkInsurance));

export default router;
