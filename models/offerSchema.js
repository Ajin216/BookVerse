const mongoose = require("mongoose");

const offerSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true,
    trim: true
  },
  discount: {
    type: Number,
    required: true,
    min: 0,
    max: 100
  },
  type: {
    type: String,
    required: true,
    enum: ['product', 'category']
  },
  products: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product'
  }],
  category: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category'
  }],
  validTill: {
    type: Date,
    required: true
  },
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active'
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Offer', offerSchema);