// 404 Not Found Middleware
const handleNotFound = (req, res, next) => {
    const isAdmin = req.originalUrl.startsWith("/admin");

    if (isAdmin) {
        // Admin side 404
        return res.status(404).render("admin404", { title: "Admin Page Not Found" });
    } else {
        // User side 404
        return res.status(404).render("user404", { title: "Page Not Found" });
    }
};

// 500 Server Error Middleware
const handleServerError = (err, req, res, next) => {
    console.error("Server Error:", err.stack);

    const isAdmin = req.originalUrl.startsWith("/admin");

    if (res.headersSent) {
        return next(err); // Delegate to default Express handler if headers already sent
    }

    if (isAdmin) {
        // Admin side 500
        return res.status(500).render("admin500", { title: "Admin Server Error" });
    } else {
      
        return res.status(500).render("user500", { title: "Server Error" });
    }
};

module.exports = { handleNotFound, handleServerError };
