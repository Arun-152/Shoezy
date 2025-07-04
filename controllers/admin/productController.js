const Products = require("../../models/productSchema")
const category = require("../../models/productSchema")


const productsPage = async(req,res)=>{
    try {
        const searchRaw = req.query.search
        const search = typeof(searchRaw)==="string" ? searchRaw.trim():"";
        function escapeRegex(string){
            return string.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
            
        }
        const escapedSearch=escapeRegex(search)
        const page = parseInt(req.query.page) || 1
        const limit = 5
        const skip = (page-1)*limit

        const searchFilter = escapedSearch ? {name:{$regex:escapedSearch,$options:"i"}} : {};
        const productsData = await Products.find({...searchFilter})
        .sort({createdAt:-1})
        .skip(skip)
        .limit(limit)

        const totalProducts = await Products.countDocuments({...searchFilter})
        const totalPages = Math.ceil(totalProducts/limit)
        return res.render("productsPage",{
            products:productsData,
            currentPage:page,
            totalPages:totalPages,
            totalProducts:totalProducts,
            search,

        })


    } catch (error) {
        console.error(error)
        return res.redirect("/pageerror")
        
    }

}

module.exports={
    productsPage,
}

