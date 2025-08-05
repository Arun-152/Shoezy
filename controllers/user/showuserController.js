const User = require("../../models/userSchema");
const bcrypt = require("bcrypt")
const env = require("dotenv").config()
const session = require("express-session")
const { validateEmailConfig, createEmailTransporter, sendEmail } = require("../../config/emailConfig");

const showUser = async (req, res) => {
    try {
        const userId = req.session.userId;

        const userData = await User.findById(userId);
        if (!userData) {
            return res.redirect("/login");
        }

        res.render("myaccount", {
            user: userData,
            isLandingPage: false,
        });
    } catch (error) {
        console.error("Show user error:", error);
        res.status(500).render("usererrorPage");
    }
}
const loadEditProfile = async(req,res)=>{
    try{
       
        const userId = req.session.userId
        const userData = await User.findById(userId)

        if(!userData){
            return res.redirect("/login")
        }
         res.render("editProfile",{
            user:userData
         })
   
    }catch(error){
        console.error(error.data)
        res.redirect("/usererrorPage")
    }
}
const updateProfile = async (req, res) => {
    try {
        const userId = req.session.userId;

        if (!userId) {
            return res.status(401).json({ success: false, message: "User not authenticated" });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        const { fullName, phoneNumber } = req.body;

        if (!fullName || fullName.trim().length < 3) {
            return res.status(400).json({ success: false, message: "Full name is required and must be at least 3 characters" });
        }
        if (phoneNumber && (!/^\d{10}$/.test(phoneNumber) || !/^[789]\d{9}$/.test(phoneNumber))) {
            return res.status(400).json({ success: false, message: "Phone number must be a valid 10-digit Indian number starting with 7, 8, or 9" });
        }

        let profileImageName = user.profileImage;
        if (req.file) {
            profileImageName = '/profiles/' + req.file.filename;
        }

        const updateData = {
            fullname: fullName,
            phone: phoneNumber || user.phone, // Keep existing phone if not provided
            profileImage: profileImageName
        };

        await User.findByIdAndUpdate(userId, updateData);
        return res.status(200).json({ success: true, message: "Profile updated successfully" });

    } catch (error) {
        console.error("Update profile error:", error);
        
        // Handle multer errors
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ success: false, message: "File size too large. Maximum 5MB allowed." });
        }
        if (error.code === 'LIMIT_UNEXPECTED_FILE') {
            return res.status(400).json({ success: false, message: "Invalid file upload." });
        }
        if (error.message && error.message.includes('Only JPEG, PNG, GIF, and WebP files are allowed')) {
            return res.status(400).json({ success: false, message: "Invalid file type. Only JPEG, PNG, GIF, and WebP files are allowed." });
        }
        
        return res.status(500).json({ success: false, message: "Server error, please try again later" });
    }
}

const loadChangePassword = async(req,res)=>{
     try{
       
        const userId = req.session.userId
        const userData = await User.findById(userId)

        if(!userData){
            return res.redirect("/login")
        }
         res.render("changePasswordPage",{
            user:userData
         })
   
    }catch(error){
        console.error(error.data)
        res.redirect("/usererrorPage")
    }
}
// Function to send email change OTP
async function sendEmailChangeOTP(email, otp) {
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
            subject: "Email Change Verification - Shoezy",
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
                    <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                        <h2 style="color: #333; text-align: center; margin-bottom: 30px;">Email Change Verification</h2>
                        <p style="color: #666; font-size: 16px; line-height: 1.5;">Hello,</p>
                        <p style="color: #666; font-size: 16px; line-height: 1.5;">You have requested to change your email address on Shoezy. Please use the following OTP to verify your new email:</p>
                        <div style="text-align: center; margin: 30px 0;">
                            <span style="background-color: #007bff; color: white; padding: 15px 30px; font-size: 24px; font-weight: bold; border-radius: 5px; letter-spacing: 3px;">${otp}</span>
                        </div>
                        <p style="color: #666;">This OTP will expire in <strong>5 minutes</strong>.</p>
                        <p style="color: #666;">If you didn't request this change, please ignore this email.</p>
                        <hr style="margin: 20px 0; border: none; border-top: 1px solid #eee;">
                        <p style="color: #999; font-size: 12px; text-align: center;">This is an automated message from Shoezy. Please do not reply to this email.</p>
                    </div>
                </div>
            `
        };

        const result = await sendEmail(transporter, mailOptions);
        return result.success;
    } catch (error) {
        console.error("Error sending email change OTP:", error.message);
        return false;
    }
}

// Send OTP to new email
const sendEmailOTP = async (req, res) => {
    try {
        const { newEmail } = req.body;
        const userId = req.session.userId;

        if (!userId) {
            return res.status(401).json({ success: false, message: "User not authenticated" });
        }

        if (!newEmail) {
            return res.status(400).json({ success: false, message: "Please enter a new email address" });
        }

        // Email format validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(newEmail.trim())) {
            return res.status(400).json({ success: false, message: "Please enter a valid email address" });
        }

        // Check if email already exists
        const existingUser = await User.findOne({ email: newEmail.trim().toLowerCase() });
        if (existingUser) {
            return res.status(400).json({ success: false, message: "This email is already registered with another account" });
        }

        // Generate OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();

        // Store OTP in session
        req.session.emailChangeOTP = {
            code: otp,
            newEmail: newEmail.trim().toLowerCase(),
            expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
        };

        try {
            const emailSent = await sendEmailChangeOTP(newEmail.trim(), otp);
            if (!emailSent) {
                return res.status(500).json({
                    success: false,
                    message: "Failed to send OTP email. Please try again later."
                });
            }

            console.log("Email Change OTP:", otp); // For testing
            res.json({ success: true, message: "OTP has been sent to your new email address" });

        } catch (emailError) {
            console.error("Email sending error:", emailError);
            return res.status(500).json({
                success: false,
                message: "Failed to send OTP email. Please try again later."
            });
        }

    } catch (error) {
        console.error("Send email OTP error:", error);
        res.status(500).json({ success: false, message: "Server error, please try again later" });
    }
};

// Resend OTP
const resendEmailOTP = async (req, res) => {
    try {
        const userId = req.session.userId;
        const sessionOTP = req.session.emailChangeOTP;

        if (!userId) {
            return res.status(401).json({ success: false, message: "User not authenticated" });
        }

        if (!sessionOTP || !sessionOTP.newEmail) {
            return res.status(400).json({ success: false, message: "No active email change session found. Please start again." });
        }

        // Generate new OTP
        const newOtp = Math.floor(100000 + Math.random() * 900000).toString();

        try {
            const emailSent = await sendEmailChangeOTP(sessionOTP.newEmail, newOtp);
            if (!emailSent) {
                return res.status(500).json({
                    success: false,
                    message: "Failed to send OTP email. Please try again later."
                });
            }

            // Update session with new OTP
            req.session.emailChangeOTP = {
                code: newOtp,
                newEmail: sessionOTP.newEmail,
                expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
            };

            console.log("Resend Email Change OTP:", newOtp); // For testing
            res.json({ success: true, message: "New OTP has been sent to your email address" });

        } catch (emailError) {
            console.error("Email sending error:", emailError);
            return res.status(500).json({
                success: false,
                message: "Failed to send OTP email. Please try again later."
            });
        }

    } catch (error) {
        console.error("Resend email OTP error:", error);
        res.status(500).json({ success: false, message: "Server error, please try again later" });
    }
};

// Verify OTP and update email
const verifyEmailOTP = async (req, res) => {
    try {
        const { otp } = req.body;
        const userId = req.session.userId;
        const sessionOTP = req.session.emailChangeOTP;

        if (!userId) {
            return res.status(401).json({ success: false, message: "User not authenticated" });
        }

        if (!sessionOTP || !sessionOTP.newEmail) {
            return res.status(400).json({ success: false, message: "No active email change session found. Please start again." });
        }

        if (!otp) {
            return res.status(400).json({ success: false, message: "Please enter the OTP" });
        }

        // Check if OTP has expired
        if (Date.now() > sessionOTP.expiresAt) {
            delete req.session.emailChangeOTP;
            return res.status(400).json({ success: false, message: "OTP has expired. Please request a new one." });
        }

        // Verify OTP
        if (otp !== sessionOTP.code) {
            return res.status(400).json({ success: false, message: "Invalid OTP. Please try again." });
        }

        // Check if email is still available
        const existingUser = await User.findOne({ email: sessionOTP.newEmail });
        if (existingUser) {
            delete req.session.emailChangeOTP;
            return res.status(400).json({ success: false, message: "This email is no longer available" });
        }

        // Update user email
        await User.findByIdAndUpdate(userId, { email: sessionOTP.newEmail });

        // Clear session
        delete req.session.emailChangeOTP;

        res.json({ success: true, message: "Email successfully updated!" });

    } catch (error) {
        console.error("Verify email OTP error:", error);
        res.status(500).json({ success: false, message: "Server error, please try again later" });
    }
};

// Change Password functionality
const changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword, confirmPassword } = req.body;
        const userId = req.session.userId;

        if (!userId) {
            return res.status(401).json({ success: false, message: "User not authenticated" });
        }

        // Validation
        if (!currentPassword || !newPassword || !confirmPassword) {
            return res.status(400).json({ success: false, message: "All password fields are required" });
        }

        if (newPassword.length < 8) {
            return res.status(400).json({ success: false, message: "New password must be at least 8 characters long" });
        }

        if (newPassword !== confirmPassword) {
            return res.status(400).json({ success: false, message: "New password and confirm password do not match" });
        }

        // Get user from database
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        // Check if current password is correct
        const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
        if (!isCurrentPasswordValid) {
            return res.status(400).json({ success: false, message: "Current password is incorrect" });
        }

        // Check if new password is same as current password
        const isSamePassword = await bcrypt.compare(newPassword, user.password);
        if (isSamePassword) {
            return res.status(400).json({ success: false, message: "New password cannot be the same as current password" });
        }

        // Hash new password
        const saltRounds = 10;
        const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);

        // Update password in database
        await User.findByIdAndUpdate(userId, { password: hashedNewPassword });

        res.json({ success: true, message: "Password updated successfully!" });

    } catch (error) {
        console.error("Change password error:", error);
        res.status(500).json({ success: false, message: "Server error, please try again later" });
    }
};

// Legacy function - keeping for compatibility
const chnageEmailValid = async(req,res)=>{
    try{
        const {email}= req.body
        const userlExist = User.findOne({email})
       
    }catch(error){
        return res.redirect("/usererrorPage")
    }
}

module.exports = {
    showUser,
    loadEditProfile,
    updateProfile,
    loadChangePassword,
    changePassword,
    sendEmailOTP,
    resendEmailOTP,
    verifyEmailOTP,
    chnageEmailValid
};
