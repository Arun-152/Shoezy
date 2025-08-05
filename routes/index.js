const express = require("express");
const router = express.Router();
const userRouter = require("./user/userRouter")
const adminRouter = require("./admin/adminRouter")

function registerRoutes(app){
    app.use("/",userRouter)

    app.use("/admin",adminRouter)
}

module.exports = {
    registerRoutes,
    userRouter,
    adminRouter,
    
}