const User = require("../../models/userSchema")
const bcrypt = require("bcrypt")
const nodemailer = require("nodemailer")
const env = require("dotenv").config()


const usererrorPage = (req,res)=>{
    try {
        return res.render("usererrorPage")
    } catch (error) {
       res.status(500).json({message:"server errror"}) 
    }
}

const signupPage = async (req, res) => {
    try {
        if (req.session.userId) {
            return res.render("homePage")
        }
        return res.render("signupPage", {
            error_msg: req.flash('error_msg'),
            success_msg: req.flash('success_msg'),
            error: req.flash('error')
        })

    } catch (error) {
        console.log("login page not found")
        res.redirect("/usererrorPage")

    }
}

const landingPage = async (req, res) => {
    try {
        if (req.session.userId) {
            return res.render("homePage")
        }

        return res.render("landingPage")
    } catch (error) {
        console.log("landingpage not found")
        res.status(500).send("server error")
    }
}

const loginPage = async (req, res) => {
    try {



        if (req.session.userId) {
            return res.render("homePage")
        }
        return res.render("loginPage")
    } catch (error) {
        console.log("loginpage not found")
        res.status(500).send("server error")
    }
}
const logout = (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ message: "server error" })
        } else {
            res.redirect("/login")
        }
    });

}
function generateOtp() {
    return Math.floor(100000 + Math.random() * 900000).toString()

}
async function sendVerificationEmail(email, otp) {
    try {
        const transporter = nodemailer.createTransport({
            service: "gmail",
            port: 587,
            secure: false,
            requireTLS: true,
            auth: {
                user: process.env.NODEMAILER_EMAIL,
                pass: process.env.NODEMAILER_PASSWORD
            }

        })
        const info = await transporter.sendMail({
            from: process.env.NODEMAILER_EMAIL,
            to: email,
            subject: "verify your account",
            trxt: `your OTP is ${otp}`,
            html: `<b>your OTP:${otp}</b>`
        })
        return info.accepted.length > 0
    } catch (error) {
        console.error("error sending email", error)
        return false
    }
}


const postSignup = async (req, res) => {
    try {
        const { fullname, email, phone, password, confirmPassword } = req.body;
        
        // Check if ALL fields are empty first
        const allFieldsEmpty = (!fullname || fullname.trim() === '') && 
                              (!email || email.trim() === '') && 
                              (!phone || phone.trim() === '') && 
                              (!password || password === '') && 
                              (!confirmPassword || confirmPassword === '');

        if (allFieldsEmpty) {
            req.flash('error_msg', 'All fields are required');
            return res.redirect('/signup');
        }
        
        // Comprehensive validation with flash messages
        const errors = [];

        // Check if all fields are provided
        if (!fullname || fullname.trim() === '') {
            errors.push('Full name is required');
        } else if (fullname.trim().length < 2) {
            errors.push('Full name must be at least 2 characters long');
        } else if (!/^[a-zA-Z\s]+$/.test(fullname.trim())) {
            errors.push('Full name should only contain letters and spaces');
        }

        if (!email || email.trim() === '') {
            errors.push('Email is required');
        } else {
            // Email validation
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email.trim())) {
                errors.push('Please enter a valid email address');
            }
        }

        if (!phone || phone.trim() === '') {
            errors.push('Phone number is required');
        } else {
            // Phone validation (Indian phone number format)
            const phoneRegex = /^[6-9]\d{9}$/;
            if (!phoneRegex.test(phone.trim())) {
                errors.push('Please enter a valid 10-digit phone number starting with 6, 7, 8, or 9');
            }
        }

        if (!password || password === '') {
            errors.push('Password is required');
        } else if (password.length < 6) {
            errors.push('Password must be at least 6 characters long');
        } else if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password)) {
            errors.push('Password must contain at least one uppercase letter, one lowercase letter, and one number');
        }

        if (!confirmPassword || confirmPassword === '') {
            errors.push('Please confirm your password');
        } else if (password !== confirmPassword) {
            errors.push('Passwords do not match');
        }

        // If there are validation errors, flash them and redirect back
        if (errors.length > 0) {
            req.flash('error_msg', errors);
            return res.redirect('/signup');
        }

        // Check if user already exists
        const existingUser = await User.findOne({ 
            $or: [
                { email: email.trim().toLowerCase() },
                { phone: phone.trim() }
            ]
        });
        
        if (existingUser) {
            if (existingUser.email === email.trim().toLowerCase()) {
                req.flash('error_msg', 'An account with this email already exists');
            } else {
                req.flash('error_msg', 'An account with this phone number already exists');
            }
            return res.redirect('/signup');
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Generate and send OTP
        const otp = generateOtp();
        console.log("Signup OTP:", otp); // For development
        
        const emailSent = await sendVerificationEmail(email.trim(), otp);
        if (!emailSent) {
            req.flash('error_msg', 'Failed to send verification email. Please try again.');
            return res.redirect('/signup');
        }

        // Store user data and OTP in session
        req.session.user = { 
            fullname: fullname.trim(), 
            email: email.trim().toLowerCase(), 
            hashedPassword, 
            phone: phone.trim() 
        };
        req.session.userOtp = {
            code: otp,
            expiresAt: Date.now() + 30 * 1000 // 30 seconds
        };

        // Success - redirect to OTP verification
        res.render('otpverification');
        
    } catch (error) {
        console.error("Signup error:", error);
        req.flash('error_msg', 'An error occurred during signup. Please try again.');
        res.redirect('/signup');
    }
}
const otpverification = async (req, res) => {
    try {
        return res.render("otpverification")
    } catch (error) {
        console.log("otp page not found")
        res.status(500).send("server error")
    }

}
const verifyOTP = async (req, res) => {
    const { otp } = req.body;
    const sessionOTP = req.session.userOtp;
    const { fullname, email, phone, hashedPassword } = req.session.user;
    if (!sessionOTP || Date.now() > sessionOTP.expiresAt) {
        req.session.userOtp = null;
        return res.status(400).json({ success: false, message: "OTP expired" });
    }

    if (otp !== sessionOTP.code) {
        return res.status(400).json({ success: false, message: "Invalid OTP, Please try again" });
    }

    // OTP is valid
    const newUser = new User({
        fullname,
        email,
        phone,
        password: hashedPassword
    });
    await newUser.save();

    req.session.userOtp = null;
    req.session.userId = newUser._id;
    res.json({ success: true, redirect: "/home" });
};

const resendOTP = async (req, res) => {
    try {
        const userSession = req.session.user;
        if (!userSession || !userSession.email) {
            return res.status(400).json({ success: false, message: "No active session found. Please start signup again." });
        }

        const newOTP = generateOtp();
        
        // Send email using existing function
        const emailSent = await sendVerificationEmail(userSession.email, newOTP);
        if (!emailSent) {
            return res.status(500).json({ success: false, message: "Failed to send OTP email. Please try again." });
        }

        // Update session with new OTP
        req.session.userOtp = {
            code: newOTP,
            expiresAt: Date.now() + 30 * 1000
        };

        console.log("Resent Signup OTP:", newOTP); // For development

        res.json({ success: true, message: "New OTP has been sent to your email address" });

    } catch (error) {
        console.error("Resend OTP error:", error);
        res.status(500).json({ success: false, message: "Server error. Please try again." });
    }
}

const postlogin = async (req, res) => {
    try {
        const { email, password } = req.body
        const user = await User.findOne({ isAdmin: 0, email: email })

        if (!user) {
            return render("loginPage", {
                message: null
            })
        }

        if (user.isBlocked) {
            return res.render("loginPage", { message: "You are Blocked by admin" })
        }

        const passwordMatch = await bcrypt.compare(password, user.password)

        if (!passwordMatch) {
            return res.render("loginPage", {
                message: "Invalid Password"
            })
        }
        req.session.userId = user._id
        return res.render("homePage")

    } catch (error) {
        console.error('login error', error)
        res.send('fail loading')
    }

}

const homePage = async (req, res) => {
    try {

        const user = req.session.userId
        const userData = await User.findById(user)
        if (!userData) {
            res.redirect("/login")


        }

        return res.render("homePage")




    } catch (error) {
        console.error(error)
        res.status(500).json({message:"Server error"})

    }
}
const shopPage = (req, res) => {
    try {
        return res.render("shopPage")
    } catch (error) {
        res.status(500).send("server error")
    }
}
const showuser = async (req, res) => {
    const userId = req.session.userId

    const userData = await User.findById(userId)
    console.log(userData)
    if (!userData) {
        return res.redirect("/loginPage")
    }
    res.render("myaccount", {
        user: userData
    })
}

// Function to send OTP email for password reset
async function sendPasswordResetOTP(email, otp) {
    try {
        const transporter = nodemailer.createTransport({
            service: "gmail",
            port: 587,
            secure: false,
            requireTLS: true,
            auth: {
                user: process.env.NODEMAILER_EMAIL,
                pass: process.env.NODEMAILER_PASSWORD
            }
        });

        const info = await transporter.sendMail({
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
            `
        });
        
        return info.accepted.length > 0;
    } catch (error) {
        console.error("Error sending password reset OTP:", error);
        return false;
    }
}

// GET /forgot-password - Show forgot password form
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

// POST /forgot-password - Handle forgot password request and send OTP
const postForgotPassword = async (req, res) => {
    try {
        const { email } = req.body;

        // Validate email
        if (!email) {
            return res.status(400).json({ success: false, message: "Email is required" });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ success: false, message: "Invalid email format" });
        }

        // Find user
        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
            return res.status(400).json({ success: false, message: "No account found with this email address" });
        }

        // Generate 6-digit OTP
        const otp = generateOtp();
        
        // Store OTP in session with 5-minute expiry
        req.session.passwordResetOTP = {
            code: otp,
            email: email.toLowerCase(),
            expiresAt: Date.now() + 5 * 60 * 1000 // 5 minutes
        };

        // Send OTP email
        const emailSent = await sendPasswordResetOTP(email, otp);
        if (!emailSent) {
            return res.status(500).json({ success: false, message: "Failed to send OTP email. Please try again." });
        }

        console.log("Password Reset OTP:", otp); // For development - remove in production

        res.json({ success: true, message: "OTP has been sent to your email address" });

    } catch (error) {
        console.error("Forgot password error:", error);
        res.status(500).json({ success: false, message: "Server error. Please try again." });
    }
};

// GET /verify-otp - Show OTP verification form
const verifyOTPPage = async (req, res) => {
    try {
        if (req.session.userId) {
            return res.redirect("/home");
        }
        
        // Check if there's a valid OTP session
        if (!req.session.passwordResetOTP) {
            return res.redirect("/forgot-password");
        }

        return res.render("verify-reset-otp");
    } catch (error) {
        console.error("Error loading verify OTP page:", error);
        res.status(500).send("Server error");
    }
};

// POST /verify-otp - Verify OTP
const postVerifyOTP = async (req, res) => {
    try {
        const { otp } = req.body;

        // Validate OTP input
        if (!otp) {
            return res.status(400).json({ success: false, message: "OTP is required" });
        }

        if (otp.length !== 6 || !/^\d{6}$/.test(otp)) {
            return res.status(400).json({ success: false, message: "OTP must be 6 digits" });
        }

        // Check session OTP
        const sessionOTP = req.session.passwordResetOTP;
        if (!sessionOTP) {
            return res.status(400).json({ success: false, message: "No OTP session found. Please request a new OTP." });
        }

        // Check if OTP expired
        if (Date.now() > sessionOTP.expiresAt) {
            req.session.passwordResetOTP = null;
            return res.status(400).json({ success: false, message: "OTP has expired. Please request a new one." });
        }

        // Verify OTP
        if (otp !== sessionOTP.code) {
            return res.status(400).json({ success: false, message: "Invalid OTP. Please try again." });
        }

        // OTP is valid - mark as verified
        req.session.passwordResetOTP.verified = true;
        
        res.json({ success: true, message: "OTP verified successfully" });

    } catch (error) {
        console.error("Verify OTP error:", error);
        res.status(500).json({ success: false, message: "Server error. Please try again." });
    }
};

// POST /resend-reset-otp - Resend OTP for password reset
const resendResetOTP = async (req, res) => {
    try {
        // Check if there's a valid OTP session
        const sessionOTP = req.session.passwordResetOTP;
        if (!sessionOTP || !sessionOTP.email) {
            return res.status(400).json({ success: false, message: "No active OTP session found. Please start the process again." });
        }

        // Check if user still exists
        const user = await User.findOne({ email: sessionOTP.email });
        if (!user) {
            return res.status(400).json({ success: false, message: "User not found. Please start the process again." });
        }

        // Generate new 6-digit OTP
        const newOtp = generateOtp();
        
        // Update session with new OTP and reset expiry to 5 minutes
        req.session.passwordResetOTP = {
            code: newOtp,
            email: sessionOTP.email,
            expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
            verified: false // Reset verification status
        };

        // Send new OTP email
        const emailSent = await sendPasswordResetOTP(sessionOTP.email, newOtp);
        if (!emailSent) {
            return res.status(500).json({ success: false, message: "Failed to send OTP email. Please try again." });
        }

        console.log("Resent Password Reset OTP:", newOtp); // For development - remove in production

        res.json({ success: true, message: "New OTP has been sent to your email address" });

    } catch (error) {
        console.error("Resend OTP error:", error);
        res.status(500).json({ success: false, message: "Server error. Please try again." });
    }
};

// GET /reset-password - Show reset password form (only after OTP verified)
const resetPasswordPage = async (req, res) => {
    try {
        if (req.session.userId) {
            return res.redirect("/home");
        }

        // Check if OTP was verified
        const sessionOTP = req.session.passwordResetOTP;
        if (!sessionOTP || !sessionOTP.verified) {
            return res.redirect("/forgot-password");
        }

        // Check if session is still valid
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

// POST /reset-password - Handle password reset
const postResetPassword = async (req, res) => {
    try {
        const { password, confirmPassword } = req.body;

        // Check if OTP was verified
        const sessionOTP = req.session.passwordResetOTP;
        if (!sessionOTP || !sessionOTP.verified) {
            return res.status(400).json({ success: false, message: "Unauthorized access. Please verify OTP first." });
        }

        // Check if session is still valid
        if (Date.now() > sessionOTP.expiresAt) {
            req.session.passwordResetOTP = null;
            return res.status(400).json({ success: false, message: "Session expired. Please start the process again." });
        }

        // Validate inputs
        if (!password || !confirmPassword) {
            return res.status(400).json({ success: false, message: "All fields are required" });
        }

        if (password.length < 6) {
            return res.status(400).json({ success: false, message: "Password must be at least 6 characters long" });
        }

        if (password !== confirmPassword) {
            return res.status(400).json({ success: false, message: "Passwords do not match" });
        }

        // Find user
        const user = await User.findOne({ email: sessionOTP.email });
        if (!user) {
            return res.status(400).json({ success: false, message: "User not found" });
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Update user password
        user.password = hashedPassword;
        await user.save();

        // Clear session
        req.session.passwordResetOTP = null;

        res.json({ success: true, message: "Password has been reset successfully" });

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
    resendOTP,
    showuser,
    usererrorPage,
    forgotPasswordPage,
    postForgotPassword,
    verifyOTPPage,
    postVerifyOTP,
    resendResetOTP,
    resetPasswordPage,
    postResetPassword
}