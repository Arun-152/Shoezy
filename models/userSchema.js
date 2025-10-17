const mongoose = require("mongoose");
const { Schema } = mongoose;

const UserSchema = new Schema(
    {
        fullname: {
            type: String,
            required: true,
            trim: true,
        },
        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
        },
        phone: {
            type: String,
            required: function () {
                return !this.googleId;
            },
            trim: true,
        },
        password: {
            type: String,
            required: function () {
                return !this.googleId;
            },
        },
        googleId: {
            type: String,
            required: false,
            unique: true,
            trim: true,
            default: null,
        },
        profilePicture: {
            type: String,
            default: '',
        },
        isVerified: {
            type: Boolean,
            default: false,
        },
        isBlocked: {
            type: Boolean,
            default: false,
        },

        wishlist: [{
            type: Schema.Types.ObjectId,
            ref: "Product"
        }],
        cart: [{
            type: Schema.Types.ObjectId,
            ref: "Cart"
        }], 
        referralCode: {
            type: String,
            unique: true,
            required: false,
        },
        referredBy: {
            type: String, 
            default: null,
        },
        isAdmin: {
            type: Boolean,
            default: false,
        },
    },
    { timestamps: true }
);

UserSchema.pre("save", function (next) {
    this.updatedAt = new Date();
    next();
});
const User = mongoose.model("User", UserSchema)
module.exports = User