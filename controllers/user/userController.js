const User = require("../../models/userSchema");
const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
const bcrypt = require("bcrypt");
const nodemailer = require("nodemailer");
const { validateEmailConfig, createEmailTransporter, sendEmail } = require("../../config/emailConfig");
require("dotenv").config();

const usererrorPage = (req, res) => {
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
        return res.render("signupPage", {
            error_msg: req.flash("error_msg"),
            success_msg: req.flash("success_msg"),
            error: req.flash("error"),
        });
    } catch (error) {
        console.log("Signup page not found");
        res.redirect("/usererrorPage");
    }
};

const landingPage = async (req, res) => {
    try {
        // Fetch featured products for landing page (same logic as home page)
        const featuredProducts = await Product.find({ isDeleted: false, isBlocked: false })
            .populate("category")
            .sort({ createdAt: -1 })
            .limit(6);

        // Check if user is logged in for navbar display
        let userData = null;
        if (req.session.userId) {
            userData = await User.findById(req.session.userId);
        }

        return res.render("landingPage", {
            products: featuredProducts,
            user: userData,
            isLandingPage: true,
        });
    } catch (error) {
        console.log("Landing page error:", error);
        res.status(500).send("Server error");
    }
};

const loginPage = async (req, res) => {
    try {
        if (req.session.userId) {
            return res.redirect("/home");
        }
        return res.render("loginPage");
    } catch (error) {
        console.log("Login page not found");
        res.status(500).send("Server error");
    }
};

const logout = (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ message: "Server error" });
        } else {
            res.redirect("/login");
        }
    });
};

function generateOtp() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendVerificationEmail(email, otp) {
    try {
        // Validate email configuration first
        const validation = validateEmailConfig();
        if (!validation.isValid) {
            console.log("❌ Email configuration error:", validation.message);
            return false;
        }

        const transporter = createEmailTransporter();
        if (!transporter) {
            console.log("❌ Failed to create email transporter");
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
        const { fullname, email, phone, password, confirmPassword } = req.body;
        console.log("Signup request received:", req.body);

        const allFieldsEmpty =
            (!fullname || fullname.trim() === "") &&
            (!email || email.trim() === "") &&
            (!phone || phone.trim() === "") &&
            (!password || password === "") &&
            (!confirmPassword || confirmPassword === "");

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
        } else if (password.length < 6) {
            errors.push("Password must be at least 6 characters long");
        } else if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password)) {
            errors.push("Password must contain at least one uppercase letter, one lowercase letter, and one number");
        }

        if (!confirmPassword || confirmPassword === "") {
            errors.push("Please confirm your password");
        } else if (password !== confirmPassword) {
            errors.push("Passwords do not match");
        }

        if (errors.length > 0) {
            console.log("Validation errors:", errors);
            return res.status(400).json({ success: false, message: errors.join(", ") });
        }

        const existingUser = await User.findOne({
            $or: [{ email: email.trim().toLowerCase() }, { phone: phone.trim() }],
        });

        if (existingUser) {
            console.log("User already exists");
            const message =
                existingUser.email === email.trim().toLowerCase()
                    ? "An account with this email already exists"
                    : "An account with this phone number already exists";
            return res.status(400).json({ success: false, message });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const otp = generateOtp();
        console.log("Signup OTP:", otp);

        let emailSent = false;
        try {
            emailSent = await sendVerificationEmail(email.trim(), otp);
            if (emailSent) {
                console.log("Email sent successfully");
            } else {
                console.log("Email sending failed");
            }
        } catch (emailError) {
            console.log("Email error:", emailError.message);
        }

        req.session.user = {
            fullname: fullname.trim(),
            email: email.trim().toLowerCase(),
            hashedPassword,
            phone: phone.trim(),
        };
        req.session.userOtp = {
            code: otp,
            expiresAt: Date.now() + 5 * 60 * 1000,
        };

        console.log("Redirecting to OTP verification page");
        res.render("otpverification")
        console.log("otp",otp)
    } catch (error) {
        console.error("Signup error:", error);
        res.status(500).json({ success: false, message: "Server error. Please try again." });
    }
};

const otpverification = async (req, res) => {
    try {
        if (!req.session.user || !req.session.userOtp) {
            req.flash("error_msg", "No active signup session found. Please try again.");
            return res.redirect("/signup");
        }
        return res.render("otpverification", {
            email: req.session.user.email,
            error_msg: req.flash("error_msg"),
            success_msg: req.flash("success_msg"),
        });
    } catch (error) {
        console.log("OTP page not found");
        res.status(500).send("Server error");
    }
};

const verifyOTP = async (req, res) => {
    try {
        const { otp } = req.body;

        if (!req.session.user) {
            return res.status(400).json({ success: false, message: "No signup session found. Please start signup again." });
        }

        const sessionOTP = req.session.userOtp;
        const { fullname, email, phone, hashedPassword } = req.session.user;

        if (!sessionOTP || Date.now() > sessionOTP.expiresAt) {
            req.session.userOtp = null;
            return res.status(400).json({ success: false, message: "OTP expired. Please request a new OTP." });
        }

        if (otp !== sessionOTP.code) {
            return res.status(400).json({ success: false, message: "Invalid OTP. Please try again." });
        }

        const newUser = new User({
            fullname,
            email,
            phone,
            password: hashedPassword,
        });
        await newUser.save();

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

        console.log("Resent Signup OTP:", newOTP);
        res.json({ success: true, message: "New OTP has been sent to your email address" });
    } catch (error) {
        console.error("Resend OTP error:", error);
        res.status(500).json({ success: false, message: "Server error. Please try again." });
    }
};

const postlogin = async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ isAdmin: 0, email: email });

        if (!user) {
            return res.render("loginPage", {
                message: "User not found",
            });
        }

        if (user.isBlocked) {
            return res.render("loginPage", { message: "You are Blocked by admin" });
        }

        const passwordMatch = await bcrypt.compare(password, user.password);

        if (!passwordMatch) {
            return res.render("loginPage", {
                message: "Invalid Password",
            });
        }
        req.session.userId = user._id;
        return res.redirect("/home");
    } catch (error) {
        console.error("Login error", error);
        res.status(500).send("Fail loading");
    }
};

const homePage = async (req, res) => {
    try {
        const user = req.session.userId;
        const userData = await User.findById(user);
        if (!userData) {
            return res.redirect("/login");
        }

        const featuredProducts = await Product.find({ isDeleted: false, isBlocked: false })
            .populate("category")
            .sort({ createdAt: -1 })
            .limit(6);

        return res.render("homePage", {
            products: featuredProducts,
            user: userData,
            isLandingPage: false,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error" });
    }
};

const shopPage = async (req, res) => {
    try {
        const products = await Product.find({ isDeleted: false, isBlocked: false })
            .populate("category")
            .sort({ createdAt: -1 });

        const categories = await Category.find({ isDeleted: false, isListed: true });

        return res.render("shopPage", {
            products: products,
            categories: categories,
            isLandingPage: false,
        });
    } catch (error) {
        console.error("Shop page error:", error);
        res.status(500).send("Server error");
    }
};

const productDetailPage = async (req, res) => {
    try {
        const productId = req.params.id;
        
        // Validate product ID
        if (!productId || !productId.match(/^[0-9a-fA-F]{24}$/)) {
            return res.status(404).render("usererrorPage");
        }

        // Find the product with populated category
        const product = await Product.findOne({ 
            _id: productId, 
            isDeleted: false, 
            isBlocked: false 
        }).populate("category");

        if (!product) {
            return res.status(404).render("usererrorPage");
        }

        // Find related products from the same category
        let relatedProducts = [];
        if (product.category) {
            relatedProducts = await Product.find({
                _id: { $ne: productId }, // Exclude current product
                category: product.category._id,
                isDeleted: false,
                isBlocked: false
            })
            .populate("category")
            .limit(4); // Limit to 4 related products
        }

        // If not enough related products from same category, get random products
        if (relatedProducts.length < 4) {
            const additionalProducts = await Product.find({
                _id: { $ne: productId },
                isDeleted: false,
                isBlocked: false
            })
            .populate("category")
            .limit(4 - relatedProducts.length);
            
            relatedProducts = [...relatedProducts, ...additionalProducts];
        }

        return res.render("productDetailPage", {
            product: product,
            relatedProducts: relatedProducts,
            isLandingPage: false,
        });

    } catch (error) {
        console.error("Product detail page error:", error);
        res.status(500).render("usererrorPage");
    }
};

const showuser = async (req, res) => {
    const userId = req.session.userId;

    const userData = await User.findById(userId);
    console.log(userData);
    if (!userData) {
        return res.redirect("/loginPage");
    }
    res.render("myaccount", {
        user: userData,
        isLandingPage: false,
    });
};

const contactPage = async (req, res) => {
    try {
        // Check if user is logged in for navbar display
        let userData = null;
        if (req.session.userId) {
            userData = await User.findById(req.session.userId);
        }

        return res.render("contactPage", {
            user: userData,
            isLandingPage: false,
        });
    } catch (error) {
        console.log("Contact page error:", error);
        res.status(500).send("Server error");
    }
};

const orderPage = async (req, res) => {
    try {
        const user = req.session.userId;
        const userData = await User.findById(user);
        if (!userData) {
            return res.redirect("/login");
        }

        // Here you can fetch user's orders from database
        // const orders = await Order.find({ userId: user }).populate('products');

        return res.render("orderPage", {
            user: userData,
            isLandingPage: false,
            // orders: orders || []
        });
    } catch (error) {
        console.log("Order page error:", error);
        res.status(500).send("Server error");
    }
};

async function sendPasswordResetOTP(email, otp) {
    try {
        // Validate email configuration first
        const validation = validateEmailConfig();
        if (!validation.isValid) {
            console.log("❌ Email configuration error:", validation.message);
            throw new Error(validation.message);
        }

        const transporter = createEmailTransporter();
        if (!transporter) {
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
        if (req.session.userId) {
            return res.redirect("/home");
        }
        return res.render("forgot-password");
    } catch (error) {
        console.error("Error loading forgot password page:", error);
        res.status(500).send("Server error");
    }
};

const postForgotPassword = async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ success: false, message: "Email is required" });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ success: false, message: "Invalid email format" });
        }

        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
            return res.status(400).json({ success: false, message: "No account found with this email address" });
        }

        if (user.isBlocked) {
            return res.status(400).json({ success: false, message: "Your account has been blocked. Please contact support." });
        }

        const otp = generateOtp();

        // Store OTP in session first
        req.session.passwordResetOTP = {
            code: otp,
            email: email.toLowerCase(),
            expiresAt: Date.now() + 30 * 1000,
        };

        // Check if email configuration is properly set for production
        const isEmailConfigured = process.env.NODEMAILER_EMAIL && 
                                  process.env.NODEMAILER_PASSWORD &&
                                  process.env.NODEMAILER_EMAIL !== 'your-email@gmail.com' && 
                                  process.env.NODEMAILER_EMAIL !== 'your-actual-email@gmail.com' &&
                                  process.env.NODEMAILER_PASSWORD !== 'your-app-password' &&
                                  process.env.NODEMAILER_PASSWORD !== 'your-actual-app-password' &&
                                  process.env.NODEMAILER_EMAIL.trim() !== '' &&
                                  process.env.NODEMAILER_PASSWORD.trim() !== '';

        if (!isEmailConfigured) { 
            res.json({ 
                success: true, 
                message: "OTP generated successfully. Check console for OTP (Testing Mode)", 
                redirect: "/verify-reset-otp" 
            });
            return;
        }

        try {
            const emailSent = await sendPasswordResetOTP(email, otp);
            if (!emailSent) {
                console.log("Email sending failed. OTP for testing:", otp);
                return res.status(500).json({ 
                    success: false, 
                    message: "Failed to send OTP email. Please try again later. (For testing, check console for OTP)" 
                });
            }

            console.log("Password Reset OTP:", otp);
            res.json({ success: true, message: "OTP has been sent to your email address", redirect: "/verify-reset-otp" });
        } catch (emailError) {
            console.error("Email sending error:", emailError);
            console.log("OTP for testing:", otp);
            return res.status(500).json({ 
                success: false, 
                message: "Failed to send OTP email due to email service error. Please try again later. (For testing, check console for OTP)" 
            });
        }
    } catch (error) {
        console.error("Forgot password error:", error);
        res.status(500).json({ success: false, message: "Server error. Please try again." });
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
        res.status(500).send("Server error");
    }
};

const postVerifyOTP = async (req, res) => {
    try {
        const { otp } = req.body;

        if (!otp) {
            return res.status(400).json({ success: false, message: "OTP is required" });
        }

        if (otp.length !== 6 || !/^\d{6}$/.test(otp)) {
            return res.status(400).json({ success: false, message: "OTP must be 6 digits" });
        }

        const sessionOTP = req.session.passwordResetOTP;
        if (!sessionOTP) {
            return res.status(400).json({ success: false, message: "No OTP session found. Please request a new OTP." });
        }

        if (Date.now() > sessionOTP.expiresAt) {
            req.session.passwordResetOTP = null;
            return res.status(400).json({ success: false, message: "OTP has expired. Please request a new one." });
        }

        if (otp !== sessionOTP.code) {
            return res.status(400).json({ success: false, message: "Invalid OTP. Please try again." });
        }

        req.session.passwordResetOTP.verified = true;

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
            return res.status(400).json({ success: false, message: "No active OTP session found. Please start the process again." });
        }

        const user = await User.findOne({ email: sessionOTP.email });
        if (!user) {
            return res.status(400).json({ success: false, message: "User not found. Please start the process again." });
        }

        const newOtp = generateOtp();

        req.session.passwordResetOTP = {
            code: newOtp,
            email: sessionOTP.email,
            expiresAt: Date.now() + 30 * 1000,
            verified: false,
        };

        // Check if email configuration is properly set for production
        const isEmailConfigured = process.env.NODEMAILER_EMAIL && 
                                  process.env.NODEMAILER_PASSWORD &&
                                  process.env.NODEMAILER_EMAIL !== 'your-email@gmail.com' && 
                                  process.env.NODEMAILER_EMAIL !== 'your-actual-email@gmail.com' &&
                                  process.env.NODEMAILER_PASSWORD !== 'your-app-password' &&
                                  process.env.NODEMAILER_PASSWORD !== 'your-actual-app-password' &&
                                  process.env.NODEMAILER_EMAIL.trim() !== '' &&
                                  process.env.NODEMAILER_PASSWORD.trim() !== '';

        if (!isEmailConfigured) {
            res.json({ 
                success: true, 
                message: "New OTP generated successfully. Check console for OTP (Testing Mode)" 
            });
            return;
        }

        try {
            const emailSent = await sendPasswordResetOTP(sessionOTP.email, newOtp);
            if (!emailSent) {
                console.log("Email sending failed. Resent OTP for testing:", newOtp);
                return res.status(500).json({ 
                    success: false, 
                    message: "Failed to send OTP email. Please try again later. (For testing, check console for OTP)" 
                });
            }

            console.log("Resent Password Reset OTP:", newOtp);
            res.json({ success: true, message: "New OTP has been sent to your email address" });
        } catch (emailError) {
            console.error("Email sending error:", emailError);
            console.log("Resent OTP for testing:", newOtp);
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
        res.status(500).send("Server error");
    }
};

const postResetPassword = async (req, res) => {
    try {
        const { password, confirmPassword } = req.body;

        const sessionOTP = req.session.passwordResetOTP;
        if (!sessionOTP || !sessionOTP.verified) {
            return res.status(400).json({ success: false, message: "Unauthorized access. Please verify OTP first." });
        }

        if (Date.now() > sessionOTP.expiresAt) {
            req.session.passwordResetOTP = null;
            return res.status(400).json({ success: false, message: "Session expired. Please start the process again." });
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

module.exports = {
    signupPage,
    landingPage,
    loginPage,
    postSignup,
    otpverification,
    verifyOTP,
    postlogin,
    homePage,
    logout,
    shopPage,
    productDetailPage,
    resendOTP,
    showuser,
    contactPage,
    orderPage,
    usererrorPage,
    forgotPasswordPage,
    postForgotPassword,
    verifyOTPPage,
    postVerifyOTP,
    resendResetOTP,
    resetPasswordPage,
    postResetPassword,
};