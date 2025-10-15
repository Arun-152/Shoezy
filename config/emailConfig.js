const nodemailer = require("nodemailer");
require("dotenv").config();

// Email validation
function validateEmailConfig() {
    const email = process.env.NODEMAILER_EMAIL;
    const password = process.env.NODEMAILER_PASSWORD;
    
    if (!email || !password) {
        return {
            isValid: false,
            message: "NODEMAILER_EMAIL and NODEMAILER_PASSWORD must be set in .env file"
        };
    }
    
    if (email.trim() === "" || password.trim() === "") {
        return {
            isValid: false,
            message: "NODEMAILER_EMAIL and NODEMAILER_PASSWORD cannot be empty"
        };
    }
    
    const placeholderEmails = [
        'your-email@gmail.com',
        'your-actual-email@gmail.com',
        'test@gmail.com',
        'example@gmail.com'
    ];
    
    const placeholderPasswords = [
        'your-app-password',
        'your-actual-app-password',
        'password',
        'test-password'
    ];
    
    if (placeholderEmails.includes(email) || placeholderPasswords.includes(password)) {
        return {
            isValid: false,
            message: "Please replace placeholder values with real Gmail credentials"
        };
    }
    
    return { isValid: true };
}

function createEmailTransporter() {
    const validation = validateEmailConfig();
    
    if (!validation.isValid) {
        console.error(validation.message);
        return validation.message;
    }

    try {
        const transporter = nodemailer.createTransport({
            service: "gmail",   
            auth: {
                user: process.env.NODEMAILER_EMAIL,
                pass: process.env.NODEMAILER_PASSWORD, 
            },
        });

        return transporter;
    } catch (error) {
        console.error("❌ Error creating email transporter:", error.message);
        return null;
    }
}


async function sendEmail(transporter, mailOptions) {
    if (!transporter) {
        throw new Error("Email transporter not configured");
    }

    try {
        const info = await transporter.sendMail(mailOptions);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error("Error sending email:", error.message);
        console.error("Error code:", error.code);
        console.error("Error details:", error);

       
        if (error.code === 'EAUTH') {
            throw new Error("Gmail authentication failed. Please check your email and app password in your .env file.");
        } else if (error.code === 'ENOTFOUND') {
            throw new Error("Network error. Please check your internet connection.");
        } else if (error.code === 'ETIMEDOUT') {
            throw new Error("Email sending timed out. Please try again.");
        } else if (error.code === 'ECONNECTION') {
            throw new Error("Connection error. Please check your internet connection.");
        } else {
            throw new Error(`Email sending failed: ${error.message}`);
        }
    }
}

module.exports = {
    validateEmailConfig,
    createEmailTransporter,
    sendEmail
};