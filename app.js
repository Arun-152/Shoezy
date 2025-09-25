
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

// Special-case: if user enters '/home/' (with trailing slash), show 404 page
app.use((req, res, next) => {
    if (req.path === '/home/') {
        return res.status(404).render('error/user404', {
            title: 'Page Not Found',
            message: "The page you are looking for doesn't exist or has been moved."
        })
    }
    next()
})

registerRoutes(app)

// 404 handler - must be after all routes
app.use((req, res, next) => {
    try {
        const isAdminPath = req.originalUrl && req.originalUrl.startsWith('/admin')
        const view = isAdminPath ? 'error/admin404' : 'error/user404'
        res.status(404).render(view, { 
            title: 'Page Not Found',
            message: "The page you are looking for doesn't exist or has been moved."
        })
    } catch (e) {
        next(e)
    }
})

app.use((err, req, res, next) => {
    console.error('Unhandled error:', err)
    if (res.headersSent) return next(err)

    const status = err.status || err.statusCode || 500
    const isAdminPath = req.originalUrl && req.originalUrl.startsWith('/admin')
    const view = status === 404
        ? (isAdminPath ? 'error/admin404' : 'error/user404')
        : (isAdminPath ? 'error/admin500' : 'error/user500')

    res.status(status >= 400 && status < 600 ? status : 500)
    res.render(view, { 
        error: process.env.NODE_ENV === 'development' ? err : undefined,
        title: status === 404 ? 'Page Not Found' : 'Internal Server Error',
        message: status === 404
            ? "The page you are looking for doesn't exist or has been moved."
            : (process.env.NODE_ENV === 'development' && err && err.message
                ? err.message
                : "Something went wrong on our end. We're working to fix this issue.")
    })
})

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
    console.log("Server running");
    
})
