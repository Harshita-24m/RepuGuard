const { v4: uuidv4 } = require('uuid');
const Scan = require('../models/Scan');
const User = require('../models/User');
const { scanCandidate } = require('../services/scannerService');
const { generateAIReport } = require('../services/aiReportService');

// @route  POST /api/scans/start
// @desc   Start a new candidate scan
// @access Private
const startScan = async (req, res) => {
  try {
    const { candidateName, candidateRole, candidateHandles, platforms, scanDepth } = req.body;

    if (!candidateName) {
      return res.status(400).json({ success: false, message: 'Candidate name is required' });
    }

    const user = req.user;

    // Check scan limits
    if (user.plan === 'free' && user.scansUsed >= user.scansLimit) {
      return res.status(403).json({
        success: false,
        message: `Free plan limit reached (${user.scansLimit} scans). Please upgrade to Pro.`
      });
    }

    const scanId = uuidv4();
    const selectedPlatforms = platforms && platforms.length > 0
      ? platforms
      : ['Twitter/X', 'Instagram', 'YouTube', 'Facebook', 'Reddit'];

    // Create scan record
    const scan = await Scan.create({
      scanId,
      recruiterId: user._id,
      candidateName: candidateName.trim(),
      candidateRole: candidateRole?.trim() || 'Not Specified',
      candidateHandles: candidateHandles?.trim() || '',
      platforms: selectedPlatforms,
      scanDepth: scanDepth || 'standard',
      status: 'scanning'
    });

    // Return immediately with scanId — let client poll for results
    res.status(202).json({
      success: true,
      message: 'Scan started',
      scanId,
      dbId: scan._id
    });

    // Run scan in background
    const startTime = Date.now();
    try {
      const { platformResults, overallScore } = await scanCandidate(
        candidateName, selectedPlatforms, candidateHandles, scanDepth
      );

      const aiReport = await generateAIReport(candidateName, candidateRole, overallScore, platformResults);

      const verdict = overallScore >= 75
        ? '✅ Safe to Hire'
        : overallScore >= 50
        ? '⚠️ Proceed with Caution'
        : '🚫 High Risk — Review Required';

      const scanDuration = Math.round((Date.now() - startTime) / 1000);

      const riskLevel = overallScore >= 75 ? 'safe' : overallScore >= 50 ? 'caution' : 'high_risk';

      await Scan.findByIdAndUpdate(scan._id, {
        status: 'completed',
        overallScore,
        riskLevel,
        platformResults,
        aiReport,
        aiReportGenerated: true,
        verdict,
        scanDuration,
        dataSource: platformResults.some(p => p.dataSource === 'real_api') ? 'real_api' : 'mock'
      });

      // Increment user scan count
      await User.findByIdAndUpdate(user._id, { $inc: { scansUsed: 1 } });

    } catch (scanErr) {
      console.error('Background scan error:', scanErr);
      await Scan.findByIdAndUpdate(scan._id, { status: 'failed' });
    }

  } catch (error) {
    console.error('startScan error:', error);
    res.status(500).json({ success: false, message: 'Server error starting scan' });
  }
};

// @route  GET /api/scans/:scanId/status
// @desc   Poll scan status (called by frontend every 2s)
// @access Private
const getScanStatus = async (req, res) => {
  try {
    const scan = await Scan.findOne({ scanId: req.params.scanId, recruiterId: req.user._id });

    if (!scan) {
      return res.status(404).json({ success: false, message: 'Scan not found' });
    }

    if (scan.status === 'completed') {
      return res.json({
        success: true,
        status: 'completed',
        scan: formatScanResponse(scan)
      });
    }

    res.json({ success: true, status: scan.status, message: 'Scan in progress...' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @route  GET /api/scans
// @desc   Get all scans for the recruiter
// @access Private
const getAllScans = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const filter = { recruiterId: req.user._id };
    if (req.query.riskLevel) filter.riskLevel = req.query.riskLevel;
    if (req.query.status) filter.status = req.query.status;

    const [scans, total] = await Promise.all([
      Scan.find(filter)
        .select('scanId candidateName candidateRole overallScore riskLevel verdict status createdAt scanDuration')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Scan.countDocuments(filter)
    ]);

    // Dashboard stats
    const stats = await Scan.aggregate([
      { $match: { recruiterId: req.user._id, status: 'completed' } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          safe: { $sum: { $cond: [{ $eq: ['$riskLevel', 'safe'] }, 1, 0] } },
          caution: { $sum: { $cond: [{ $eq: ['$riskLevel', 'caution'] }, 1, 0] } },
          highRisk: { $sum: { $cond: [{ $eq: ['$riskLevel', 'high_risk'] }, 1, 0] } }
        }
      }
    ]);

    res.json({
      success: true,
      scans,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      stats: stats[0] || { total: 0, safe: 0, caution: 0, highRisk: 0 }
    });
  } catch (error) {
    console.error('getAllScans error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching scans' });
  }
};

// @route  GET /api/scans/:scanId
// @desc   Get single scan details
// @access Private
const getScanById = async (req, res) => {
  try {
    const scan = await Scan.findOne({ scanId: req.params.scanId, recruiterId: req.user._id });

    if (!scan) {
      return res.status(404).json({ success: false, message: 'Scan not found' });
    }

    res.json({ success: true, scan: formatScanResponse(scan) });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @route  DELETE /api/scans/:scanId
// @desc   Delete a scan
// @access Private
const deleteScan = async (req, res) => {
  try {
    const scan = await Scan.findOneAndDelete({ scanId: req.params.scanId, recruiterId: req.user._id });

    if (!scan) {
      return res.status(404).json({ success: false, message: 'Scan not found' });
    }

    res.json({ success: true, message: 'Scan deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Helper to format scan for response
const formatScanResponse = (scan) => ({
  scanId: scan.scanId,
  candidateName: scan.candidateName,
  candidateRole: scan.candidateRole,
  candidateHandles: scan.candidateHandles,
  platforms: scan.platforms,
  scanDepth: scan.scanDepth,
  overallScore: scan.overallScore,
  riskLevel: scan.riskLevel,
  verdict: scan.verdict,
  platformResults: scan.platformResults,
  aiReport: scan.aiReport,
  status: scan.status,
  scanDuration: scan.scanDuration,
  dataSource: scan.dataSource,
  createdAt: scan.createdAt
});

module.exports = { startScan, getScanStatus, getAllScans, getScanById, deleteScan };
