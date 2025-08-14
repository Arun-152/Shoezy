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
            enum: ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled', 'Returned', 'ReturnRequested','ReturnApproved'], 
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
        enum: ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled', 'ReturnRequested', 'Returned','ReturnApproved'], 
        default: 'Pending'
    },
    paymentStatus: {
        type: String,
        enum: ['Pending', 'Paid', 'Failed'],
        default: 'Pending'
    },
    statusHistory: [{
        status: {
            type: String,
            enum: ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled', 'Returned','ReturnRequested'], // ✅ added
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
    }
}, {
    timestamps: true
});

const Order = mongoose.model("Order", orderSchema);
module.exports = Order;
