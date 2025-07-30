
const express = require("express")
const app = express()
const path = require("path")
const env = require("dotenv").config()
const session = require("express-session")
const flash = require("connect-flash")
const passport = require("./config/passport")
const {registerRoutes} = require("./routes/index")
const db = require("./config/db")
db()


app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: true,  // Changed to true to ensure session persistence
    saveUninitialized: true,  // Changed back to true for OAuth compatibility
    cookie: {
        secure: false,
        httpOnly: true,
        maxAge: 72 * 60 * 60 * 1000
    },
    name: 'connect.sid',  // Explicit session name
    rolling: false  // Don't reset expiry on every request
}))

app.use(flash())

app.use(passport.initialize())
app.use(passport.session())

// Custom middleware to handle session regeneration issues
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

// 404 Error Handler - Route not found
app.use((req, res, next) => {
    const isAdminRoute = req.path.startsWith('/admin');

    if (isAdminRoute) {
        // Admin side 404
        res.status(404).render('error/admin404', {
            title: 'Page Not Found - Admin',
            message: 'The admin page you are looking for does not exist.',
            url: req.originalUrl
        });
    } else {
        // User side 404
        res.status(404).render('error/user404', {
            title: 'Page Not Found',
            message: 'The page you are looking for does not exist.',
            url: req.originalUrl
        });
    }
});

// 500 Error Handler - Server errors
app.use((err, req, res, next) => {
    console.error('Server Error:', err);

    const isAdminRoute = req.path.startsWith('/admin');

    if (isAdminRoute) {
        // Admin side 500
        res.status(500).render('error/admin500', {
            title: 'Server Error - Admin',
            message: 'An internal server error occurred in the admin panel.',
            error: process.env.NODE_ENV === 'development' ? err : {}
        });
    } else {
        // User side 500
        res.status(500).render('error/user500', {
            title: 'Server Error',
            message: 'An internal server error occurred. Please try again later.',
            error: process.env.NODE_ENV === 'development' ? err : {}
        });
    }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log("Server running");
    
})
