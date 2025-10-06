const mongoose = require("mongoose");
const { Schema } = mongoose;

const orderSchema = new Schema({
    orderNumber: {
        type: String,
        unique: true,
        required: true
    },
    userId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    items: [{
        productId: {
            type: Schema.Types.ObjectId,
            ref: "Product",
            required: true
        },
        size: {
            type: String,
            required: false,
            default: "Default"
        },
        quantity: {
            type: Number,
            required: true
        },
        price: {
            type: Number,
            required: true
        },
        totalPrice: {
            type: Number,
            required: true
        },
        status: {
            type: String,
            enum: [
                'Pending',
                'Processing',
                'Shipped',
                'Delivered',
                'Cancelled',
                'Returned',
                'ReturnRequested',
                'ReturnApproved',
                'Failed'
            ],
            default: 'Pending'
        }
    }],
    address: {
        fullName: String,
        mobileNumber: String,
        address: String,
        city: String,
        district: String,
        state: String,
        landmark: String,
        pinCode: Number,
        addressType: String
    },
    totalAmount: {
        type: Number,
        required: true
    },
    paymentMethod: {
        type: String,
        enum: ['COD', 'Online', 'Wallet'],
        required: true
    },
    orderStatus: {
        type: String,
        enum: [
      "Pending",
      "Processing",
      "Shipped",
      "Delivered",
      "Cancelled",
      "Returned",
      "ReturnRequested",
      "ReturnApproved",
      "Failed",
        ],
    default: "Paid",
    },
    paymentStatus: {
        type: String,
    enum: [
      "Pending",
      "Paid",
      "Failed",
      "Failed_Stock_Issue",
      "Failed_Product_Missing",
      "Failed_Variant_Missing",
    ],
    default: "Pending",
    },
    razorpayPaymentId: {
        type: String,
        required: false
    },
    statusHistory: [{
        status: {
            type: String,
            enum: [
                'Pending',
                'Processing',
                'Shipped',
                'Delivered',
                'Cancelled',
                'Returned',
                'ReturnRequested',
                'ReturnApproved'
            ],
            required: true
        },
        date: {
            type: Date,
            default: Date.now
        },
        description: {
            type: String,
            required: false
        }
    }],
    isLocked: {
        type: Boolean,
        default: false
    },
    cancellationReason: {
        type: String,
        required: false
    },
    orderReturnReason: {
        type: String,
        default: null
    },
    deliveryDate: {
        type: Date,
        required: false
    },
    couponCode: {
        type: String,     // store coupon name/code
        default: null
    },
    couponId: {
        type: Schema.Types.ObjectId, // reference actual Coupon document
        ref: "Coupon",
        default: null
    },
    discountAmount: {
        type: Number,     // how much discount was applied
        default: 0
    }

}, { timestamps: true });

const Order = mongoose.model("Order", orderSchema);
module.exports = Order;
