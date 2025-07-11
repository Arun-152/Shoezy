const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
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
            required: function() {
                // Phone is not required for Google OAuth users
                return !this.googleId;
            },
            trim: true,
        },
        password: {
            type: String,
            required: function() {
                // Password is not required for Google OAuth users
                return !this.googleId;
            },
        },
        googleId: {
            type: String,
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

module.exports = mongoose.model("User", UserSchema);