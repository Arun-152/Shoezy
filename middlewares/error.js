
const handleNotFound = (req, res, next) => {
    const isAdmin = req.originalUrl.startsWith("/admin");

    if (isAdmin) {
        return res.status(404).render("admin404", { title: "Admin Page Not Found" });
    } else {
        return res.status(404).render("user404", { title: "Page Not Found" });
    }
};

const handleServerError = (err, req, res, next) => {
    console.error("Server Error:", err.stack);

    const isAdmin = req.originalUrl.startsWith("/admin");

    if (res.headersSent) {
        return next(err); 
    }

    if (isAdmin) {
        return res.status(500).render("admin500", { title: "Admin Server Error" });
    } else {
      
        return res.status(500).render("user500", { title: "Server Error" });
    }
};

module.exports = { handleNotFound, handleServerError };
