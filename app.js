
const express = require("express")
const app = express()
const path = require("path")
const userRouter = require("./routes/userRouter")
const authRouter = require("./routes/authRouter")
const env = require("dotenv").config()
const session = require("express-session")
const flash = require("connect-flash")
const adminRouter = require("./routes/adminRouter")
const passport = require("./config/passport")
const db = require("./config/db")
db()


app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: {
        secure: false,
        httpOnly: true,
        maxAge: 72 * 60 * 60 * 1000
    }
}))

// Flash middleware
app.use(flash())

// Passport middleware
app.use(passport.initialize())
app.use(passport.session())

// Make flash messages available to all views
app.use((req, res, next) => {
    res.locals.success_msg = req.flash('success_msg')
    res.locals.error_msg = req.flash('error_msg')
    res.locals.error = req.flash('error')
    next()
})

app.use((req,res,next)=>{
    res.set('cache-control','no-store')
    next()
})


app.set("view engine", "ejs")
app.set("views", [path.join(__dirname, "views/user"), path.join(__dirname, "views/admin")])
app.use(express.static(path.join(__dirname, "public")))

app.use("/", userRouter)
app.use("/auth", authRouter)
app.use("/admin", adminRouter);

app.listen(process.env.PORT, () => {
    console.log("server running")
})