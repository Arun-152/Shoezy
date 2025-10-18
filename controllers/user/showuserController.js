const User = require("../../models/userSchema");
const Address = require("../../models/addressSchema");
const bcrypt = require("bcrypt")
const env = require("dotenv").config()
const session = require("express-session")
const { validateEmailConfig, createEmailTransporter, sendEmail } = require("../../config/emailConfig");
const Wallet = require("../../models/walletSchema");


const showUser = async (req, res) => {
    try {
        const userId = req.session.userId;

        const userData = await User.findById(userId);
        if (!userData) {
            return res.redirect("/login");
        }

        // wallet balance
        const wallet = await Wallet.findOne({ userId: userId });
        const walletBalance = wallet ? wallet.balance : 0;

        res.render("myaccount", {
            user: userData,
            walletBalance,   
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

        let profileImageName = user.profilePicture;
        if (req.file) {
        
            profileImageName = '/uploads/profiles/' + req.file.filename;
        }

        user.fullname = fullName
        user.phone = phoneNumber
        user.profilePicture = profileImageName
       
       

        await user.save()
        
        return res.status(200).json({ success: true, message: "Profile updated successfully" });

    } catch (error) {
        console.error("Update profile error:", error);
        
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

        //  validation
      const emailRegex = /^[a-zA-Z][a-zA-Z0-9._%+-]{2,}@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

    if (!newEmail || !emailRegex.test(newEmail.trim())) {
      return res.status(400).json({ success: false, message: "Please enter a valid email address" });
    }

        const existingUser = await User.findOne({ email: newEmail.trim().toLowerCase() });
        if (existingUser) {
            return res.status(400).json({ success: false, message: "This email is already registered with another account" });
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString();

        req.session.emailChangeOTP = {
            code: otp,
            newEmail: newEmail.trim().toLowerCase(),
            expiresAt: Date.now() + 5 * 60 * 1000, 
        };

        try {
            const emailSent = await sendEmailChangeOTP(newEmail.trim(), otp);
            if (!emailSent) {
                return res.status(500).json({
                    success: false,
                    message: "Failed to send OTP email. Please try again later."
                });
            }

            console.log("Email Change OTP:", otp); 
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
                expiresAt: Date.now() + 5 * 60 * 1000, 
            };

            console.log("Resend Email Change OTP:", newOtp); 
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

        const existingUser = await User.findOne({ email: sessionOTP.newEmail });
        if (existingUser) {
            delete req.session.emailChangeOTP;
            return res.status(400).json({ success: false, message: "This email is no longer available" });
        }

        await User.findByIdAndUpdate(userId, { email: sessionOTP.newEmail });

        delete req.session.emailChangeOTP;

        res.json({ success: true, message: "Email successfully updated!" });

    } catch (error) {
        console.error("Verify email OTP error:", error);
        res.status(500).json({ success: false, message: "Server error, please try again later" });
    }
};

const changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword, confirmPassword } = req.body;
        const userId = req.session.userId;

        if (!userId) {
            return res.status(401).json({ success: false, message: "User not authenticated" });
        }

        const errors = [];

        // Validation
        if (!currentPassword || currentPassword.trim() === "") {
            errors.push("Current password is required");
        }

        if (!newPassword || newPassword.trim() === "") {
            errors.push("New password is required");
        } else if (newPassword.length < 5) {
            errors.push("New password must be at least 5 characters long");
        } else if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).*$/.test(newPassword)) {
            errors.push("New password must contain at least one uppercase letter, one lowercase letter, and one number");
        }

        if (!confirmPassword || confirmPassword.trim() === "") {
            errors.push("Please confirm your new password");
        } else if (newPassword !== confirmPassword) {
            errors.push("New password and confirm password do not match");
        }

        if (errors.length > 0) {
            return res.status(400).json({ success: false, message: errors.join(". ") });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
        if (!isCurrentPasswordValid) {
            return res.status(400).json({ success: false, message: "Current password is incorrect" });
        }

        const isSamePassword = await bcrypt.compare(newPassword, user.password);
        if (isSamePassword) {
            return res.status(400).json({ success: false, message: "New password cannot be the same as current password" });
        }

        const saltRounds = 10;
        const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);

        await User.findByIdAndUpdate(userId, { password: hashedNewPassword });

        res.json({ success: true, message: "Password updated successfully!" });

    } catch (error) {
        console.error("Change password error:", error);
        res.status(500).json({ success: false, message: "Server error, please try again later" });
    }
};

const chnageEmailValid = async(req,res)=>{
    try{
        const {email}= req.body
        const userlExist = User.findOne({email})
       
    }catch(error){
        return res.redirect("/usererrorPage")
    }
}

const loadAddress = async(req,res)=>{
    try{
        const userId = req.session.userId
        const userData = await User.findById(userId)

        if(!userData){
            return res.redirect("/login")
        }

        const addresses = await Address.find({ userId: userId }).sort({ 
            isDefault: -1,  
            createdAt: -1   
        });
        const returnURL = req.query.returnUrl ||  '/profile/address'
        
        
        res.render("addressPage", {
            user: userData,
            addresses: addresses,
            errors: {},
            formData: {},
            returnURL,
        })
   
    }catch(error){
        console.error("Load address error:", error)
        res.redirect("/usererrorPage")
    }
}

const postAdd = async(req,res)=>{
    try{
        const userId = req.session.userId;
        const {
            fullName,
            mobileNumber,
            address,
            city,
            district,
            state,
            landmark,
            pinCode,
            addressType
        } = req.body;

        const errors = {};
        
        if (!fullName || fullName.trim() === '') {
            errors.fullName = "Full name is required";
        } else if (fullName.trim().length < 2) {
            errors.fullName = "Full name must be at least 2 characters";
        } else if (/\d/.test(fullName)) {
            errors.fullName = "Full name cannot contain numbers";
        }
        
        if (!mobileNumber || mobileNumber.trim() === '') {
            errors.mobileNumber = "Mobile number is required";
        } else if (!/^[6789]\d{9}$/.test(mobileNumber.trim())) {
            errors.mobileNumber = "Please enter a valid 10-digit mobile number starting with 7, 8, or 9";
        }
        
        if (!address || address.trim() === '') {
            errors.address = "Address is required";
        } else if (address.trim().length < 5) {
            errors.address = "Address must be at least 5 characters";
        } else if (address.trim().split(/\s+/).length > 50) {
            errors.address = "Address cannot exceed 50 words";
        }
        
        if (!city || city.trim() === '') {
            errors.city = "City is required";
        } else if (city.trim().length < 2) {
            errors.city = "City must be at least 2 characters";
        } else if (/\d/.test(city)) {
            errors.city = "City cannot contain numbers";
        }
        
        if (!district || district.trim() === '') {
            errors.district = "District is required";
        } else if (district.trim().length < 2) {
            errors.district = "District must be at least 2 characters";
        }
        
        if (!state || state.trim() === '') {
            errors.state = "State is required";
        } else if (state.trim().length < 2) {
            errors.state = "State must be at least 2 characters";
        }
        
        if (!pinCode || pinCode.trim() === '') {
            errors.pinCode = "Pin code is required";
        } else if (!/^\d{6}$/.test(pinCode.trim())) {
            errors.pinCode = "Please enter a valid 6-digit pin code";
        }
        
        if (!addressType || addressType.trim() === '') {
            errors.addressType = "Address type is required";
        } else if (!['home', 'office', 'other'].includes(addressType.toLowerCase())) {
            errors.addressType = "Please select a valid address type";
        }
        if (!landmark || landmark.trim() === '') {
            errors.landmark = "landmark is required";
        } else if (landmark.trim().length < 4) {
            errors.landmark = "Landmark must be at least 4 characters";
        } else if (/^\d+$/.test(landmark.trim())) {
            errors.landmark = "Landmark cannot be only numbers";
        }

        const returnURL = req.body.returnUrl ||  '/profile/address'
       
        if (Object.keys(errors).length > 0) {
            const userData = await User.findById(userId);
            const addresses = await Address.find({ userId: userId }).sort({ 
                isDefault: -1,
                createdAt: -1 
            });
            
            
            return res.render("addressPage", {
                user: userData,
                addresses: addresses,
                errors: errors,
                formData: req.body,
                returnURL: returnURL
            });
        }

        const existingAddress = await Address.findOne({
            userId: userId,
            address: address.trim(),
            city: city.trim(),
            district: district.trim(),
            state: state.trim(),
            pinCode: parseInt(pinCode)
        });

        if (existingAddress) {
            const userData = await User.findById(userId);
            const addresses = await Address.find({ userId: userId }).sort({ 
                isDefault: -1,
                createdAt: -1 
            });
            
            return res.render("addressPage", {
                user: userData,
                addresses: addresses,
                errors: { address: "This address already exists." },
                formData: req.body,
                returnURL: returnURL
            });
        }
        
        const newAddress = new Address({
            userId: userId,
            fullName: fullName.trim(),
            mobileNumber: mobileNumber.trim(),
            address: address.trim(),
            city: city.trim(),
            district: district.trim(),
            state: state.trim(),
            landmark: landmark ? landmark.trim() : "",
            pinCode: parseInt(pinCode),
            addressType: addressType.charAt(0).toUpperCase() + addressType.slice(1).toLowerCase(),
           
        });

        await newAddress.save();
        
       res.redirect(`${returnURL}?success=true`);
        
    }catch(error){
        console.error("Post add address error:", error);
        res.redirect("/usererrorPage");
    }
}

const updateAddress = async(req, res) => {
    try {
        const userId = req.session.userId;
        const addressId = req.params.id;
        const {
            fullName,
            mobileNumber,
            address,
            city,
            district,
            state,
            landmark,
            pinCode,
            addressType
        } = req.body;

        // Validation 
        const errors = {};
        
        if (!fullName || fullName.trim() === '') {
            errors.fullName = 'Full name is required';
        } else if (fullName.trim().length < 2) {
            errors.fullName = 'Full name must be at least 2 characters';
        } else if (/\d/.test(fullName)) {
            errors.fullName = "Full name cannot contain numbers";
        }
        
        if (!mobileNumber || mobileNumber.trim() === '') {
            errors.mobileNumber = 'Mobile number is required';
        }else if (!/^(\+\d{1,3})?[6-9]\d{9}$/.test(mobileNumber.trim())) {
            errors.mobileNumber = "Please enter a valid mobile number (10 digits starting with 6-9, with optional country code like +91, +1, +44)";
        }


        
        if (!address || address.trim() === '') {
            errors.address = 'Address is required';
        } else if (address.trim().length < 5) {
            errors.address = 'Address must be at least 5 characters';
        } else if (address.trim().split(/\s+/).length > 50) {
            errors.address = "Address cannot exceed 50 words";
        }
        
        if (!city || city.trim() === '') {
            errors.city = 'City is required';
        } else if (city.trim().length < 2) {
            errors.city = 'City must be at least 2 characters';
        } else if (/\d/.test(city)) {
            errors.city = "City cannot contain numbers";
        }
        
        if (!district || district.trim() === '') {
            errors.district = 'District is required';
        } else if (district.trim().length < 2) {
            errors.district = 'District must be at least 2 characters';
        }
        
        if (!state || state.trim() === '') {
            errors.state = 'State is required';
        } else if (state.trim().length < 2) {
            errors.state = 'State must be at least 2 characters';
        }
        
        if (!pinCode || pinCode.trim() === '') {
            errors.pinCode = 'Pin code is required';
        } else if (!/^\d{6}$/.test(pinCode.trim())) {
            errors.pinCode = 'Please enter a valid 6-digit pin code';
        }
        
        if (!addressType || addressType.trim() === '') {
            errors.addressType = 'Address type is required';
        } else if (!['home', 'office', 'other'].includes(addressType.toLowerCase())) {
            errors.addressType = 'Please select a valid address type';
        }

        if (!landmark || landmark.trim() === '') {
            errors.landmark = 'Landmark is required';
        } else if (landmark.trim().length < 4) {
            errors.landmark = 'Landmark must be at least 4 characters';
        } else if (/^\d+$/.test(landmark.trim())) {
            errors.landmark = "Landmark cannot be only numbers";
        }

        if (Object.keys(errors).length > 0) {
            return res.status(400).json({
                success: false,
                errors: errors
            });
        }

        const existingAddress = await Address.findOne({ _id: addressId, userId: userId });
        if (!existingAddress) {
            return res.status(404).json({
                success: false,
                message: 'Address not found'
            });
        }

        const duplicateAddress = await Address.findOne({
            userId: userId,
            _id: { $ne: addressId }, 
            address: address.trim(),
            city: city.trim(),
            district: district.trim(),
            state: state.trim(),
            pinCode: parseInt(pinCode),
            addressType: addressType.charAt(0).toUpperCase() + addressType.slice(1).toLowerCase()
        });

        if (duplicateAddress) {
            return res.status(400).json({
                success: false,
                message: 'This address already exists.'
            });
        }

        const updatedAddress = await Address.findByIdAndUpdate(
            addressId,
            {
                fullName: fullName.trim(),
                mobileNumber: mobileNumber.trim(),
                address: address.trim(),
                city: city.trim(),
                district: district.trim(),
                state: state.trim(),
                landmark: landmark ? landmark.trim() : '',
                pinCode: parseInt(pinCode),
                addressType: addressType.charAt(0).toUpperCase() + addressType.slice(1).toLowerCase()
            },
            { new: true }
        );

        res.json({
            success: true,
            message: 'Address updated successfully',
            address: updatedAddress
        });
        
    } catch(error) {
        console.error('Update address error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error, please try again later'
        });
    }
}

const setDefaultAddress = async(req, res) => {
    try {
        const userId = req.session.userId;
        const addressId = req.params.id;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'User not authenticated'
            });
        }

        const address = await Address.findOne({ _id: addressId, userId: userId });
        if (!address) {
            return res.status(404).json({
                success: false,
                message: 'Address not found'
            });
        }

        await Address.updateMany(
            { userId: userId },
            { $set: { isDefault: false } }
        );

        await Address.findByIdAndUpdate(
            addressId,
            { $set: { isDefault: true } }
        );

        res.json({
            success: true,
            message: 'Default address updated successfully'
        });

    } catch(error) {
        console.error('Set default address error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error, please try again later'
        });
    }
}

const deleteAddress = async(req, res) => {
    try {
        const userId = req.session.userId;
        const addressId = req.params.id;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'User not authenticated'
            });
        }

        const address = await Address.findOne({ _id: addressId, userId: userId });
        if (!address) {
            return res.status(404).json({
                success: false,
                message: 'Address not found'
            });
        }

        const isDefaultAddress = address.isDefault;

        await Address.findByIdAndDelete(addressId);

        if (isDefaultAddress) {
            const oldestAddress = await Address.findOne({ userId: userId }).sort({ createdAt: 1 });
            
            if (oldestAddress) {
                await Address.findByIdAndUpdate(
                    oldestAddress._id,
                    { $set: { isDefault: true } }
                );
            }
        }

        res.json({
            success: true,
            message: 'Address deleted successfully'
        });

    } catch(error) {
        console.error('Delete address error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error, please try again later'
        });
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
    chnageEmailValid,
    loadAddress,
    postAdd,
    updateAddress,
    setDefaultAddress,
    deleteAddress
};