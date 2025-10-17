const mongoose = require("mongoose");
const User = require("./userSchema");
const { Schema } = mongoose;

const couponSchema = new Schema({
  name: {
    type: String,
    required: [true, "Coupon name is required"],
    unique: true,
    trim: true
  },
  createdOn: {
    type: Date,
    default: Date.now,
    required: true
  },
  startDate: {
    type: Date,
    required: true,
    default: Date.now
  },
  expireOn: {
    type: Date,
    required: true
  },
  discountType: {
    type: String,
    enum: ['flat', 'percentage'],
    required: true,
    default: 'flat'
  },
  offerPrice: {
    type: Number,
    required: true
  },
  maxAmount: {
    type: Number,
    // Max amount is only required for percentage-based coupons
    required: function() {
      return this.discountType === 'percentage';
    },
    min: [0, "Max amount must be a non-negative number"]
  },
  minimumPrice: {
    type: Number,
    required: true
  },
  applicableCategories: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "Category"
  }],
  applicableProducts: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product"
  }],
  isAllCategories: {
    type: Boolean,
    default: true
  },
  status:  {
    type:String,
    enum:["Available","Used","Expired"],
    default:"Available"
  },
  isAllProducts: {
    type: Boolean,
    default: true
  },
  maxUsesPerUser: {
    type: Number,
    default: 1,
    min: 1
  },
  totalUsageLimit: {
    type: Number,
    min: 1
  },
  currentUsageCount: {
    type: Number,
    default: 0,
    min: 0
  },
  islist: {
    type: Boolean,
    default: true
  },
  isDeleted:{
    type:Boolean,
    default:false
  },
  userUsage:[
    {
      userId:{
        type:mongoose.Schema.Types.ObjectId,ref:"User"
      },
      orderId:{type:mongoose.Schema.Types.ObjectId,ref:"Order"}

    }
  ],
  userId: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  }]
});

// Pre-save hook to trim and uppercase the name field
couponSchema.pre('save', function (next) {
  if (this.name) {
    this.name = this.name.trim().toUpperCase();
  }
  next();
});

// Validate name is not empty
couponSchema.path('name').validate(function (value) {
  return value && value.trim().length > 0;
}, 'Coupon name cannot be empty');

// Drop the problematic code_1 index (development only)
couponSchema.statics.dropCodeIndex = async function () {
  try {
    const indexes = await this.collection.indexes();
    if (indexes.some(index => index.name === 'code_1')) {
      await this.collection.dropIndex('code_1');
      console.log('Dropped code_1 index from coupons collection');
    }
  } catch (error) {
    console.error('Error dropping code_1 index:', error);
  }
};

const Coupon = mongoose.model("Coupon", couponSchema);

// Run index cleanup on startup (development only)
Coupon.dropCodeIndex();

module.exports = Coupon;