const mongoose = require('mongoose');

const flaggedContentSchema = new mongoose.Schema({
  platform: String,
  type: { type: String, enum: ['hate_speech', 'harassment', 'explicit', 'political_extremism', 'discriminatory', 'misinformation', 'other'] },
  severity: { type: String, enum: ['low', 'medium', 'high'] },
  description: String,
  url: String,
  date: String
}, { _id: false });

const platformResultSchema = new mongoose.Schema({
  platform: { type: String, required: true },
  score: { type: Number, min: 0, max: 100 },
  status: { type: String, enum: ['clean', 'caution', 'high_risk', 'not_found', 'private', 'error'] },
  postsAnalyzed: { type: Number, default: 0 },
  flaggedCount: { type: Number, default: 0 },
  summary: String,
  profileUrl: String,
  profileFound: { type: Boolean, default: false }
}, { _id: false });

const scanSchema = new mongoose.Schema({
  scanId: {
    type: String,
    required: true,
    unique: true
  },
  recruiterId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  // Candidate Info
  candidateName: { type: String, required: true, trim: true },
  candidateRole: { type: String, trim: true, default: 'Not Specified' },
  candidateHandles: { type: String, default: '' }, // comma-separated social handles

  // Scan Config
  platforms: [{ type: String }],
  scanDepth: { type: String, enum: ['quick', 'standard', 'deep'], default: 'standard' },

  // Results
  overallScore: { type: Number, min: 0, max: 100, default: 0 },
  riskLevel: { type: String, enum: ['safe', 'caution', 'high_risk'], default: 'safe' },
  verdict: { type: String, default: '' },

  platformResults: [platformResultSchema],
  flaggedContent: [flaggedContentSchema],

  // AI Report
  aiReport: { type: String, default: '' },
  aiReportGenerated: { type: Boolean, default: false },

  // Scan Status
  status: {
    type: String,
    enum: ['pending', 'scanning', 'completed', 'failed'],
    default: 'pending'
  },
  scanDuration: { type: Number, default: 0 }, // in seconds
  dataSource: { type: String, enum: ['real_api', 'mock'], default: 'mock' },

  // PDF Report
  pdfPath: { type: String, default: '' },

  notes: { type: String, default: '' } // recruiter notes
}, {
  timestamps: true
});

// Auto-set riskLevel from score
scanSchema.pre('save', function() {
  if (this.overallScore >= 75) this.riskLevel = 'safe';
  else if (this.overallScore >= 50) this.riskLevel = 'caution';
  else this.riskLevel = 'high_risk';
});

module.exports = mongoose.model('Scan', scanSchema);
