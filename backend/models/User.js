const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    maxlength: [100, 'Name cannot exceed 100 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  password: {
    type: String,
    minlength: [6, 'Password must be at least 6 characters'],
    select: false
  },
  company: {
    type: String,
    trim: true,
    default: ''
  },
  role: {
    type: String,
    enum: ['recruiter', 'hr_manager', 'admin'],
    default: 'recruiter'
  },
  googleId: {
    type: String,
    default: null
  },
  avatar: {
    type: String,
    default: ''
  },
  plan: {
    type: String,
    enum: ['free', 'pro', 'enterprise'],
    default: 'free'
  },
  scansUsed: {
    type: Number,
    default: 0
  },
  scansLimit: {
    type: Number,
    default: 10 // free plan: 10 scans/month
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Hash password before saving
userSchema.pre('save', async function() {
  if (!this.isModified('password') || !this.password) return;
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Compare password method
userSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
