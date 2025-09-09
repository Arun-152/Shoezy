
const express = require("express")
const app = express()
const path = require("path")
const env = require("dotenv").config()
const session = require("express-session")
const flash = require("connect-flash")
const passport = require("./config/passport")
const {registerRoutes} = require("./routes/index")
const db = require("./config/db")
const navbarCount =require("./middlewares/navbarCount")
db()


app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: true,  
    saveUninitialized: true, 
    cookie: {
        secure: false,
        httpOnly: true,
        maxAge: 72 * 60 * 60 * 1000
    },
    name: 'connect.sid',  
    rolling: false 
}))
app.use(navbarCount)
app.use(flash())


app.use(passport.initialize())
app.use(passport.session())


app.use((req, res, next) => {
    if (req.session && !req.session.regenerate) {
        req.session.regenerate = (cb) => {
            cb()
        }
    }
    if (req.session && !req.session.save) {
        req.session.save = (cb) => {
            cb()
        }
    }
    next()
})

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
app.set("views", [path.join(__dirname, "views/user"), path.join(__dirname, "views/admin"), path.join(__dirname, "views")])
app.use(express.static(path.join(__dirname, "public")))

registerRoutes(app)



const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log("Server running");
    
})
