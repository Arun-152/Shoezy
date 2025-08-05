const User = require("../../models/userSchema");
const bcrypt = require("bcrypt")
const env = require("dotenv").config()
const session = require("express-session")

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
    chnageEmailValid
};
