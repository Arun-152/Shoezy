const User = require("../../models/userSchema");
const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
const bcrypt = require("bcrypt");
const nodemailer = require("nodemailer");
const Wallet = require("../../models/walletSchema")
const { validateEmailConfig, createEmailTransporter, sendEmail } = require("../../config/emailConfig");
require("dotenv").config();
const {generatedReferralCode} = require("../../helpers/generateReferral")
const userErrorPage = (req, res) => {
    try {
        return res.render("usererrorPage");
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
};

const signupPage = async (req, res) => {
    try {
        if (req.session.userId) {
            return res.redirect("/home");
        }
        const referralCode = req.query.referralCode || null; // Extract referralCode from query
        return res.render("signupPage", {
            error_msg: req.flash("error_msg"),
            success_msg: req.flash("success_msg"),
            error: req.flash("error"),
            referralCode: referralCode, // Pass referralCode to the view
        });
    } catch (error) {
        console.error("Error loading signup page:", error);
        res.redirect("/usererrorPage");
    }
};


const loginPage = async (req, res) => {
    try {
        if (req.session.userId) {
            return res.redirect("/home");
        }
        // Always render with clean form - no pre-filled values
        return res.render("loginPage", {
            email: "",
            password: "",
            title: "User Login"
        });
    } catch (error) {
        res.status(500).send("Server error");
    }
};

const logout = (req, res) => {
    // Check if user session exists
    if (req.session && req.session.userId) {
        // Destroy only the user session key
        delete req.session.userId;

        // Optionally, clear any other user-specific data
        delete req.session.userName; // if stored
        delete req.session.isUserAuthenticated; // if using flag

        // Clear session cookie if needed
        res.clearCookie('connect.sid');

        return res.redirect('/login');
    } else {
        // If user session doesn't exist, redirect anyway
        return res.redirect('/login');
    }
};

function generateOtp() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendVerificationEmail(email, otp) {
    try {
        // Validate email configuration first
        const validation = validateEmailConfig();
        if (!validation.isValid) {
            return false;
        }

        const transporter = createEmailTransporter();
        if (!transporter) {
            return false;
        }

        const mailOptions = {
            from: process.env.NODEMAILER_EMAIL,
            to: email,
            subject: "Verify Your Shoezy Account - OTP Verification",
            text: `Your OTP for account verification is: ${otp}. This OTP will expire in 5 minutes.`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <h2 style="color: #333; text-align: center;">Welcome to Shoezy!</h2>
                    <p>Thank you for signing up with Shoezy. To complete your account verification, please use the OTP below:</p>
                    <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
                        <h3 style="color: #007bff; font-size: 32px; margin: 0; letter-spacing: 5px;">${otp}</h3>
                    </div>
                    <p style="color: #666;">This OTP will expire in <strong>5 minutes</strong>.</p>
                    <p style="color: #666;">If you didn't create an account with Shoezy, please ignore this email.</p>
                    <hr style="margin: 20px 0; border: none; border-top: 1px solid #eee;">
                    <p style="font-size: 12px; color: #999; text-align: center;">Shoezy - Your trusted shoe store</p>
                </div>
            `,
        };

        const result = await sendEmail(transporter, mailOptions);
        return result.success;
    } catch (error) {
        console.error("Error sending verification email:", error.message);
        return false;
    }
}

const postSignup = async (req, res) => {
    try {
        const { fullname, email, phone, password, confirmPassword, referralCode } = req.body;

        const allFieldsEmpty =
            (!fullname || fullname.trim() === "") &&
            (!email || email.trim() === "") &&
            (!phone || phone.trim() === "") &&
            (!password || password === "") &&
            (!confirmPassword || confirmPassword === "")


        if (allFieldsEmpty) {
            return res.status(400).json({ success: false, message: "All fields are required" });
        }

        const errors = [];

        if (!fullname || fullname.trim() === "") {
            errors.push("Full name is required");
        } else if (fullname.trim().length < 2) {
            errors.push("Full name must be at least 2 characters long");
        } else if (!/^[a-zA-Z\s]+$/.test(fullname.trim())) {
            errors.push("Full name should only contain letters and spaces");
        }

        if (!email || email.trim() === "") {
            errors.push("Email is required");
        } else {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email.trim())) {
                errors.push("Please enter a valid email address");
            }
        }

        if (!phone || phone.trim() === "") {
            errors.push("Phone number is required");
        } else {
            const phoneRegex = /^[6-9]\d{9}$/;
            if (!phoneRegex.test(phone.trim())) {
                errors.push("Please enter a valid 10-digit phone number starting with 6, 7, 8, or 9");
            }
        }

        if (!password || password === "") {
            errors.push("Password is required");
        } else if (password.length < 5) {
            errors.push("Password must be at least 5 characters long");
        } else if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).*$/.test(password)) {
            errors.push("Password must contain at least one uppercase letter, one lowercase letter, and one number");
        }


        if (!confirmPassword || confirmPassword === "") {
            errors.push("Please confirm your password");
        } else if (password !== confirmPassword) {
            errors.push("Passwords do not match");
        }

        if (errors.length > 0) {
            return res.status(400).json({ success: false, message: errors.join(", ") });
        }
        
        console.log("postSignup: Starting user existence check for email:", email);
        const findUser = await User.findOne({ email });

        if (findUser) {
            console.log("postSignup: User with this email already exists.");
            return res.status(400).json({ success: false, message: "User with this email already exists" });
        }
        console.log("postSignup: User does not exist, proceeding with signup.");
        const hashedPassword = await bcrypt.hash(password, 10);
        const otp = generateOtp();
        console.log("postSignup: Generated OTP:", otp);

        try {
            console.log("postSignup: Attempting to send verification email to:", email.trim());
            const emailSent = await sendVerificationEmail(email.trim(), otp);
            if (!emailSent) {
                console.log("postSignup: Failed to send verification email.");
                return res.status(400).json({ success: false, message: "Could not send verification email. Please check your email address and try again." });
            }
            console.log("postSignup: Verification email sent successfully.");
        } catch (emailError) {
            console.error("postSignup: Signup email error:", emailError);
            return res.status(500).json({ success: false, message: "There was an issue with our email service. Please try again later." });
        }

        const newReferralCode = generatedReferralCode(fullname)

        req.session.user = {
            fullname: fullname.trim(),
            email: email.trim().toLowerCase(),
            hashedPassword,
            phone: phone.trim(),
            referralCode: referralCode ? referralCode.trim() : null,
            generatedReferralCode: newReferralCode
        };
        req.session.userOtp = {
            code: otp,
            expiresAt: Date.now() + 60 * 1000,
        };
        return res.status(200).json({ success: true, redirect: "/otpVerification" });
    } catch (error) {
        console.error("Signup error:", error);
        res.status(500).json({ success: false, message: "Server error. Please try again." });
    }
};

const otpVerification = async (req, res) => {
    try {
        if (req.session.user && req.session.userOtp) {
            return res.render("otpverification"); // Render the OTP verification page
        }
        return res.redirect("/signup"); // Redirect to signup if no session data
    } catch (error) {
        console.error("Error loading OTP verification page:", error);
        res.status(500).redirect("/usererrorPage");
    }
};


const verifyOTP = async (req, res) => {
    try {
        const { otp } = req.body;

        if (!req.session.user) {
            return res.status(400).json({ success: false, message: "No signup session found. Please start signup again." });
        }

        const sessionOTP = req.session.userOtp;
        const { fullname, email, phone, hashedPassword, referralCode ,generatedReferralCode} = req.session.user;


        if (!sessionOTP || Date.now() > sessionOTP.expiresAt) {
            req.session.userOtp = null;
            return res.status(400).json({ success: false, message: "OTP expired. Please request a new OTP." });
        }

        if (otp !== sessionOTP.code) {
            return res.status(400).json({ success: false, message: "Invalid OTP. Please try again." });
        }
        let existingUser = await User.findOne({ referralCode: generatedReferralCode });
        while (existingUser) {
            existingUser = await User.findOne({ referralCode: generatedReferralCode });
        }

        const newUser = new User({
            fullname,
            email,
            phone,
            password: hashedPassword,
            referralCode: generatedReferralCode,
            referredBy:  referralCode ? referralCode.trim() : null,
        });
        await newUser.save();

        const wallet = new Wallet({
            userId: newUser._id,
            balance: 0
        });

        await wallet.save();
        if (referralCode) {
            const referrer = await User.findOne({ referralCode });
            if (referrer) {
                await Wallet.findOneAndUpdate(
                    { userId: referrer._id },
                    { $inc: { balance: 100 } }
                );
                await Wallet.findOneAndUpdate(
                    { userId: newUser._id },
                    { $inc: { balance: 50 } }
                );
            }
        }

        req.session.userOtp = null;
        req.session.user = null;
        req.session.userId = newUser._id;

        res.json({ success: true, message: "Account created successfully!", redirect: "/home" });
    } catch (error) {
        console.error("OTP verification error:", error);
        res.status(500).json({ success: false, message: "Server error. Please try again." });
    }
};

const resendOTP = async (req, res) => {
    try {
        const userSession = req.session.user;
        if (!userSession || !userSession.email) {
            return res.status(400).json({ success: false, message: "No active session found. Please start signup again." });
        }

        const newOTP = generateOtp();

        const emailSent = await sendVerificationEmail(userSession.email, newOTP);
        if (!emailSent) {
            return res.status(500).json({ success: false, message: "Failed to send OTP email. Please try again." });
        }

        req.session.userOtp = {
            code: newOTP,
            expiresAt: Date.now() + 5 * 60 * 1000,
        };
        console.log("Resend Signup OTP:", newOTP);
        res.json({ success: true, message: "New OTP has been sent to your email address" });
    } catch (error) {
        console.error("Resend OTP error:", error);
        res.status(500).json({ success: false, message: "Server error. Please try again." });
    }
};

const postLogin = async (req, res) => {
    try {
        const { email, password } = req.body;

        const isAjax = req.headers['content-type'] === 'application/json' || req.headers['x-requested-with'] === 'XMLHttpRequest';
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!email || !emailRegex.test(email.trim())) {
            if (isAjax) {
                return res.status(400).json({
                    success: false,
                    message: "Please enter a valid email address.",
                    errorType: "email"
                });
            }
            return res.render("loginPage", {
                message: "Please enter a valid email address.",
                messageType: "error",
                errorType: "email"
            });
        }

        // Password validation
        if (!password || password.trim().length === 0) {
            if (isAjax) {
                return res.status(400).json({
                    success: false,
                    message: "Please enter your password.",
                    errorType: "password"
                });
            }
            return res.render("loginPage", {
                message: "Please enter your password.",
                messageType: "error",
                errorType: "password"
            });
        }

        const user = await User.findOne({ isAdmin: 0, email: email.trim().toLowerCase() });

        if (!user) {
            if (isAjax) {
                return res.status(400).json({
                    success: false,
                    message: "No account found with this email address.",
                    errorType: "email"
                });
            }
            return res.render("loginPage", {
                message: "No user account found with this email address.",
                messageType: "error",
                errorType: "email"
            });
        }

        if (user.isBlocked) {
            if (isAjax) {
                return res.status(400).json({
                    success: false,
                    message: "Your account has been blocked by admin. Please contact support.",
                    errorType: "email"
                });
            }
            return res.render("loginPage", {
                message: "Your account has been blocked by admin. Please contact support.",
                messageType: "error",
                errorType: "email"
            });
        }

        const passwordMatch = await bcrypt.compare(password, user.password);

        if (!passwordMatch) {
            if (isAjax) {
                return res.status(400).json({
                    success: false,
                    message: "Incorrect password. Please try again.",
                    errorType: "password"
                });
            }
            return res.render("loginPage", {
                message: "Incorrect password. Please try again.",
                messageType: "error",
                errorType: "password"
            });
        }

        req.session.userId = user._id;

        if (isAjax) {
            return res.json({
                success: true,
                message: "Login successful!",
                redirect: "/home"
            });
        }
        return res.redirect("/home");
    } catch (error) {
        console.error("Login error", error);

        const isAjax = req.headers['content-type'] === 'application/json' || req.headers['x-requested-with'] === 'XMLHttpRequest';

        if (isAjax) {
            return res.status(500).json({
                success: false,
                message: "An error occurred during login. Please try again.",
                errorType: "general"
            });
        }
        return res.render("loginPage", {
            message: "An error occurred during login. Please try again.",
            messageType: "error"
        });
    }
};


async function sendPasswordResetOTP(email, otp) {
    try {
        const validation = validateEmailConfig();
        if (!validation.isValid) {
            console.error("Email configuration validation failed:", validation.message);
            throw new Error(validation.message);
        }
        const transporter = createEmailTransporter();
        if (!transporter) {
            console.error("Failed to create email transporter");
            throw new Error("Failed to create email transporter");
        }


        const mailOptions = {
            from: process.env.NODEMAILER_EMAIL,
            to: email,
            subject: "Password Reset OTP - Shoezy",
            text: `Your OTP for password reset is: ${otp}. This OTP will expire in 5 minutes.`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <h2 style="color: #333; text-align: center;">Password Reset OTP</h2>
                    <p>You requested a password reset for your Shoezy account.</p>
                    <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
                        <h3 style="color: #007bff; font-size: 32px; margin: 0; letter-spacing: 5px;">${otp}</h3>
                    </div>
                    <p style="color: #666;">This OTP will expire in <strong>5 minutes</strong>.</p>
                    <p style="color: #666;">If you didn't request this, please ignore this email.</p>
                    <hr style="margin: 20px 0; border: none; border-top: 1px solid #eee;">
                    <p style="font-size: 12px; color: #999; text-align: center;">Shoezy - Your trusted shoe store</p>
                </div>
            `,
        };
        const result = await sendEmail(transporter, mailOptions);
        return result.success;
    } catch (error) {
        console.error("Error sending password reset OTP:", error.message);
        throw error;
    }
}

const forgotPasswordPage = async (req, res) => {
    try {

        return res.render("forgotEmail");
    } catch (error) {
        console.error("Forgot password page not loading", error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
};

const postForgotPassword = async (req, res) => {
    try {
        const { email } = req.body;

        // Check if email is provided
        if (!email) {
            return res.status(400).json({ success: false, message: "Please enter your email" });
        }

        // Basic email format validation
        const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
        if (!isValidEmail) {
            return res.status(400).json({ success: false, message: "Invalid email format" });
        }

        // Check if user exists
        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
            return res.status(404).json({ success: false, message: "No user found with this email" });
        }

        // Check if user is blocked
        if (user.isBlocked) {
            return res.status(403).json({ success: false, message: "Your account is blocked" });
        }

        const otp = generateOtp();

        // Store OTP in session first
        req.session.passwordResetOTP = {
            code: otp,
            email: email.toLowerCase(),
            expiresAt: Date.now() + 60 * 1000,
        };

        try {
            const emailSent = await sendPasswordResetOTP(email.toLowerCase(), otp);
            if (!emailSent) {
                return res.status(500).json({
                    success: false,
                    message: "Failed to send OTP email. Please try again later. (For testing, check console for OTP)"
                });
            }

            console.log("Password Reset OTP:", otp);
            // Change the redirect to match your GET route
            res.json({ success: true, message: "OTP has been sent to your email address", redirect: "/verifyResetOtp" });
        } catch (emailError) {
            console.error("Email sending error:", emailError);
            return res.status(500).json({
                success: false,
                message: "Failed to send OTP email due to email service error. Please try again later. (For testing, check console for OTP)"
            });
        }

    } catch (error) {
        console.error("Forgot password error:", error.message);
        res.status(500).json({ success: false, message: "Something went wrong. Please try again." });
    }
};


const verifyOTPPage = async (req, res) => {
    try {
        if (req.session.userId) {
            return res.redirect("/home");
        }

        if (!req.session.passwordResetOTP) {
            return res.redirect("/forgot-password");
        }

        return res.render("verify-reset-otp", {
            email: req.session.passwordResetOTP.email,
        });
    } catch (error) {
        console.error("Error loading verify OTP page:", error);
        return res.redirect("/usererrorPage");
    }
};

const postVerifyOTP = async (req, res) => {
    try {


        const { otp } = req.body;

        if (!otp) {

            return res.status(400).json({ success: false, message: "OTP is required" });
        }

        // Convert to string and trim
        const trimmedOTP = String(otp).trim();


        // Fixed regex pattern - single backslash
        if (trimmedOTP.length !== 6 || !/^\d{6}$/.test(trimmedOTP)) {

            return res.status(400).json({ success: false, message: "OTP must be 6 digits" });
        }

        const sessionOTP = req.session.passwordResetOTP;

        if (!sessionOTP) {

            return res.status(400).json({ success: false, message: "No OTP session found. Please request again." });
        }


        // Check expiry
        if (Date.now() > sessionOTP.expiresAt || sessionOTP.expired) {

            req.session.passwordResetOTP.expired = true;
            return res.status(400).json({ success: false, message: "OTP has expired. Please click the Resend OTP button." });
        }

        // Convert session OTP to string for comparison
        const sessionOTPCode = String(sessionOTP.code).trim();



        if (trimmedOTP !== sessionOTPCode) {

            return res.status(400).json({ success: false, message: "Invalid OTP. Please try again." });
        }



        // Mark OTP as verified
        req.session.passwordResetOTP.verified = true;

        // Save session to ensure the verified flag is persisted
        req.session.save((err) => {
            if (err) {
                console.error("Session save error:", err);
            }
        });

        res.json({ success: true, message: "OTP verified successfully", redirect: "/reset-password" });

    } catch (error) {
        console.error("Verify OTP error:", error);
        res.status(500).json({ success: false, message: "Server error. Please try again." });
    }
};


const resendResetOTP = async (req, res) => {
    try {
        const sessionOTP = req.session.passwordResetOTP;
        if (!sessionOTP || !sessionOTP.email) {
            return res.status(400).json({ success: false, message: "No active session found. Please start the process again." });
        }

        const user = await User.findOne({ email: sessionOTP.email });
        if (!user) {
            return res.status(400).json({ success: false, message: "User not found. Please start the process again." });
        }

        const newOtp = generateOtp();

        try {
            const emailSent = await sendPasswordResetOTP(sessionOTP.email, newOtp);
            if (!emailSent) {
                return res.status(500).json({
                    success: false,
                    message: "Failed to send OTP email. Please try again later. (For testing, check console for OTP)"
                });
            }

            req.session.passwordResetOTP = {
                code: newOtp,
                email: sessionOTP.email,
                expiresAt: Date.now() + 5 * 60 * 1000,
                verified: false,
                expired: false,
            };

            console.log("Resend Password OTP:", newOtp);
            res.json({ success: true, message: "New OTP has been sent to your email address" });
        } catch (emailError) {
            console.error("Email sending error:", emailError);
            return res.status(500).json({
                success: false,
                message: "Failed to send OTP email due to email service error. Please try again later. (For testing, check console for OTP)"
            });
        }
    } catch (error) {
        console.error("Resend OTP error:", error);
        res.status(500).json({ success: false, message: "Server error. Please try again." });
    }
};


const resetPasswordPage = async (req, res) => {
    try {
        if (req.session.userId) {
            return res.redirect("/home");
        }

        const sessionOTP = req.session.passwordResetOTP;
        if (!sessionOTP || !sessionOTP.verified) {
            return res.redirect("/forgot-password");
        }

        if (Date.now() > sessionOTP.expiresAt) {
            req.session.passwordResetOTP = null;
            return res.redirect("/forgot-password");
        }

        res.render("reset-password");
    } catch (error) {
        console.error("Error loading reset password page:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

const postResetPassword = async (req, res) => {
    try {
        const { password, confirmPassword } = req.body;

        const sessionOTP = req.session.passwordResetOTP;
        if (!sessionOTP || !sessionOTP.verified) {
            return res.status(400).json({ success: false, message: "Unauthorized access. Please verify OTP first." });
        }


        if (!password || !confirmPassword) {
            return res.status(400).json({ success: false, message: "All fields are required" });
        }

        if (password.length < 6) {
            return res.status(400).json({ success: false, message: "Password must be at least 6 characters long" });
        }

        if (password !== confirmPassword) {
            return res.status(400).json({ success: false, message: "Passwords do not match" });
        }

        const user = await User.findOne({ email: sessionOTP.email });
        if (!user) {
            return res.status(400).json({ success: false, message: "User not found" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        user.password = hashedPassword;
        await user.save();

        req.session.passwordResetOTP = null;


        res.json({ success: true, message: "Password has been reset successfully", redirect: "/login" });
    } catch (error) {
        console.error("Reset password error:", error);
        res.status(500).json({ success: false, message: "Server error. Please try again." });
    }
};
const loadCoupen = async (req, res) => {
    try {
        const userId = req.body.userId
        const user = await User.find(userId)
        if (user) {
            return res.render("coupenPage", {
                user
            })
        }
    } catch (error) {
        console.error("Error loading verify OTP page:", error.message);
        return res.redirect("/usererrorPage");
    }
};

module.exports = {
    signupPage,
    loginPage,
    postSignup,
    otpVerification,
    verifyOTP,
    postLogin,
    logout,
    resendOTP,
    userErrorPage,
    forgotPasswordPage,
    postForgotPassword,
    verifyOTPPage,
    postVerifyOTP,
    resendResetOTP,
    resetPasswordPage,
    postResetPassword,
    loadCoupen
};