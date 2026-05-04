const express = require('express');
const router = express.Router();
const { startScan, getScanStatus, getAllScans, getScanById, deleteScan } = require('../controllers/scanController');
const { protect } = require('../middleware/auth');

// All scan routes require authentication
router.use(protect);

router.post('/start', startScan);
router.get('/', getAllScans);
router.get('/:scanId', getScanById);
router.get('/:scanId/status', getScanStatus);
router.delete('/:scanId', deleteScan);

module.exports = router;
