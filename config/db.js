const mongoose=require("mongoose")
const env=require("dotenv").config()



const connectDB=async()=>{
    try{
        await mongoose.connect(process.env.MONGODB_URI)
        console.log("connected DB")
    }catch(error){
        console.error("DB connection error",error.message)
        process.exit(1)
    }
    
}

module.exports=connectDB