const User = require("../../models/userSchema")
const bcrypt = require("bcrypt")
const nodemailer = require("nodemailer")
const env = require("dotenv").config()

const signupPage = async (req, res) => {
    try {
        if (req.session.userId) {
            return res.render("homePage")
        }
        return res.render("signupPage")

    } catch (error) {
        console.log("login page not found")
        res.status(500).send("Server error")

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
        false

    }
}


const postSignup = async (req, res) => {
    try {
        const { fullname, email, phone, password, confirmPassword } = req.body;
        if (!fullname || !email || !phone || !password || !confirmPassword) {
            return res.status(400).send("All fields are required");
        }
        // email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.render('signup', { error: "Invalid email format" });
        }
        // Phone validation
        const phoneRegex = /^[6-9]\d{9}$/;
        if (!phoneRegex.test(phone)) {
            return res.render('signup', { error: "Invalid phone number" });
        }
        if (password !== confirmPassword) {
            return res.status(400).send("password not match")
        } const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).send('Email already in use.');
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Save user

        const otp = generateOtp()
        console.log(otp)
        const emailSent = await sendVerificationEmail(email, otp)
        if (!emailSent) {
            return res.json("email-error")
        }
        req.session.userOtp = otp
        req.session.user = { fullname, email, hashedPassword, phone };
        req.session.userOtp = {
            code: otp,
            expiresAt: Date.now() + 30 * 1000
        };

        res.render('otpverification')
    } catch (error) {
        console.error("signup error ", error)
        res.status(500).send("server error")
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
        const { email } = req.session.user
        if (!email) {
            return res.status(400).send("email not found")
        }
        const newOTP = generateOtp()
        req.session.userOtp = {
            code: newOTP,
            expiresAt: Date.now()+30*1000
        }
        console.log(newOTP)
        res.render("otpverification")

    } catch (error) {
        console.error(error)
        res.status(500).send("something went wrong")
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

        console.log(req.session.userId)
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
        console.log("login page not found")
        res.status(500).send("Server error")

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
    showuser
}