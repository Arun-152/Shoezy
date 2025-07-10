const Products = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
const Product = require("../../models/productSchema");
const MulterError = require('multer').MulterError;

const productsPage = async (req, res) => {
    try {
        const searchRaw = req.query.search;
        const search = typeof searchRaw === "string" ? searchRaw.trim() : "";
        const escapeRegex = (string) => string.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
        const escapedSearch = escapeRegex(search);
        const page = parseInt(req.query.page) || 1;
        const limit = 5;
        const skip = (page - 1) * limit;

        const searchFilter = escapedSearch ? { productName: { $regex: escapedSearch, $options: "i" } } : {};
        const productsData = await Products.find({ ...searchFilter, isDeleted: false })
            .sort({ createdAt: -1 })
            .skip(skip)
            .populate("category")
            .limit(limit);
        const totalProducts = await Products.countDocuments({ ...searchFilter, isDeleted: false });
        const totalPages = Math.ceil(totalProducts / limit);

        return res.render("productsPage", {
            products: productsData,
            currentPage: page,
            totalPages: totalPages,
            totalProducts: totalProducts,
            search:search
        });
    } catch (error) {
        console.error("Error in productsPage:", error);
        return res.redirect("/admin/adminerrorPage");
    }
};

const loadAddProductPage = async (req, res) => {
    try {
        const category = await Category.find({ isListed: true, isDeleted: false });
        return res.render("adminaddproductPage", {
            cat: category,
            message: "",
            error: null,
        });
    } catch (error) {
        console.error("Error loading Add products page:", error);
        return res.status(500).json({
            success: false,
            error: "Failed to load add product page",
        });
    }
};

const addProduct = async (req, res) => {
    try {
       
        const { productName, description, productOffer, color, category,variants } = req.body;

        // Validation
        if (!productName || productName.length < 2 || productName.length > 100) {
            return res.status(400).json({
                success: false,
                error: "Product name must be 2-100 characters",
                formData: req.body,
                cat: await Category.find({ isListed: true, isDeleted: false }),
            });
        }

        const validNameRegex = /^[a-zA-Z0-9 _-]+$/;
        if (!validNameRegex.test(productName)) {
            return res.status(400).json({
                success: false,
                error: "Product name can only contain letters, numbers, spaces, underscores, or hyphens",
                formData: req.body,
                cat: await Category.find({ isListed: true, isDeleted: false }),
            });
        }

        if (!description || description.length < 10 || description.length > 500) {
            return res.status(400).json({
                success: false,
                error: "Description must be 10-500 characters",
                formData: req.body,
                cat: await Category.find({ isListed: true, isDeleted: false }),
            });
        }

        if (productOffer && (isNaN(productOffer) || productOffer < 0 || productOffer > 100)) {
            return res.status(400).json({
                success: false,
                error: "Offer must be a number between 0 and 100 if provided",
                formData: req.body,
                cat: await Category.find({ isListed: true, isDeleted: false }),
            });
        }

        if (!color || !/^[A-Za-z, ]{1,50}$/.test(color.trim())) {
            return res.status(400).json({
                success: false,
                error: "Color must be letters, spaces, or commas (max 50 characters)",
                formData: req.body,
                cat: await Category.find({ isListed: true, isDeleted: false }),
            });
        }

        // Validate Variants
        if (!variants || !variants.size || !Array.isArray(variants.size) || variants.size.length === 0) {
            return res.status(400).json({
                success: false,
                error: "At least one variant with size, prices, and quantity is required",
                formData: req.body,
                cat: await Category.find({ isListed: true, isDeleted: false }),
            });
        }

        const variantData = [];
        const selectedSizes = new Set();
        for (let i = 0; i < variants.size.length; i++) {
            const size = variants.size[i];
            const variantPrice = parseFloat(variants.variantPrice[i]);
            const salePrice = parseFloat(variants.salePrice[i]);
            const variantQuantity = parseInt(variants.variantQuantity[i]);
            if (!size || !['6', '7', '8', '9', '10'].includes(size) || isNaN(variantPrice) || variantPrice <= 0 || isNaN(salePrice) || salePrice < 0 || isNaN(variantQuantity) || variantQuantity < 0) {
                return res.status(400).json({
                    success: false,
                    error: "Each variant must have a valid size (6-10), variant price (>0), sale price (>=0), and quantity (>=0)",
                    formData: req.body,
                    cat: await Category.find({ isListed: true, isDeleted: false }),
                });
            }
            if (salePrice > variantPrice) {
                return res.status(400).json({
                    success: false,
                    error: "Sale price cannot exceed variant price",
                    formData: req.body,
                    cat: await Category.find({ isListed: true, isDeleted: false }),
                });
            }
            if (selectedSizes.has(size)) {
                return res.status(400).json({
                    success: false,
                    error: "Duplicate sizes are not allowed",
                    formData: req.body,
                    cat: await Category.find({ isListed: true, isDeleted: false }),
                });
            }
            selectedSizes.add(size);
            variantData.push({ size, variantPrice, salePrice, variantQuantity });
        }

        // Validate Category
        const categoryDoc = await Category.findById(category);
        if (!categoryDoc || !categoryDoc.isListed || categoryDoc.isDeleted) {
            return res.status(400).json({
                success: false,
                error: "Invalid or unlisted category",
                formData: req.body,
                cat: await Category.find({ isListed: true, isDeleted: false }),
            });
        }

        // Check for Duplicate Product
        const normalizedProductName = productName.trim().toLowerCase();
        const productExists = await Products.findOne({
            productName: { $regex: new RegExp('^' + normalizedProductName + '$', 'i') },
            isDeleted: false
        });
        if (productExists) {
            return res.status(400).json({
                success: false,
                error: "Product already exists, please try with another name",
                formData: req.body,
                cat: await Category.find({ isListed: true, isDeleted: false }),
            });
        }

        // Validate and Process Images
        if (!req.files || req.files.length !== 3) {
            return res.status(400).json({
                success: false,
                error: "Exactly three images are required",
                formData: req.body,
                cat: await Category.find({ isListed: true, isDeleted: false }),
            });
        }

        const imagePaths = req.files.map(file => '/uploads/products/' + file.filename); 

        // Save Product
        const newProduct = new Products({
            productName: productName.trim(),
            description: description.trim(),
            productOffer: productOffer ? parseFloat(productOffer) : undefined,
            color: color.trim(),
            category: categoryDoc._id,
            variants: variantData,
            images: imagePaths,
            isBlocked: false,
            ratings: { average: 0, count: 0 },
            isDeleted: false,
            status: 'Available'
        });
        await newProduct.save();
        return res.status(200).json({
            success: true,
            message: "Product added successfully",
        });
    } catch (error) {
        console.error("Error in addProduct:", error);
        if (error instanceof MulterError) {
            return res.status(400).json({
                success: false,
                error: `File upload error: ${error.message}`,
                formData: req.body,
                cat: await Category.find({ isListed: true, isDeleted: false }),
            });
        }
        return res.status(500).json({
            success: false,
            error: `An error occurred: ${error.message}`,
            formData: req.body,
            cat: await Category.find({ isListed: true, isDeleted: false }),
        });
    }
};

const blockedProduct= async(req,res)=>{
    try {
        let id= req.query.id

        await Products.updateOne({_id:id},{$set:{isBlocked:true}})
        res.redirect("/admin/products")
    } catch (error) {
        res.redirect("/admin/adminerrorPage")
    }
   
}
 
const unblockedProduct= async(req,res)=>{
    try {
        let id= req.query.id
        await Products.updateOne({_id:id},{$set:{isBlocked:false}})
    res.redirect("/admin/products")
        
    } catch (error) {
        res.redirect("/admin/adminerrorPage")
        
    }
   
}
const loadEditProduct= async(req,res)=>{
    try {
        const id=req.query.id
        const product = await Products.findOne({_id:id})  
        const category = await Category.find({isListed:true}) 
        
        res.render("editproduct",{
            products:product,
            cat:category,
            
        })
        
    } catch (error) {
        res.redirect("/admin/adminerrorPage")
        
    }
}

const editProducts = async (req, res) => {
    try {
        const id = req.params.id;
        const data = req.body;

        if (!data) {
            return res.status(400).json({ message: "All fields are required" });
        }

        const existingProduct = await Products.findOne({
            productName: data.productName,
            _id: { $ne: id }
        });

        if (existingProduct) {
            return res.status(400).json({ success: false, message: "Product already exists" });
        }

        // Product name validation
        if (!data.productName || data.productName.length < 2 || data.productName.length > 100) {
            return res.status(400).json({ success: false, error: "Product name must be 2-100 characters" });
        }

        const validNameRegex = /^[a-zA-Z0-9 _-]+$/;
        if (!validNameRegex.test(data.productName)) {
            return res.status(400).json({ success: false, error: "Product name contains invalid characters" });
        }

        // Description validation
        if (!data.description || data.description.length < 10 || data.description.length > 500) {
            return res.status(400).json({ success: false, error: "Description must be 10-500 characters" });
        }
        // Offer validation
        if (data.productOffer && (isNaN(data.productOffer) || data.productOffer < 0 || data.productOffer > 100)) {
            return res.status(400).json({ success: false, error: "Offer must be between 0 and 100" });
        }

        // Color validation
        if (!data.color || !/^[A-Za-z, ]{1,50}$/.test(data.color.trim())) {
            return res.status(400).json({ success: false, error: "Invalid color format" });
        }
        // Variant validation
        const variants = data.variants;
        if (!variants || !variants.size || !Array.isArray(variants.size) || variants.size.length === 0) {
            return res.status(400).json({ success: false, error: "At least one variant required" });
        }

        const variantData = [];
        const selectedSizes = new Set();

        for (let i = 0; i < variants.size.length; i++) {
            const size = variants.size[i];
            const variantPrice = parseFloat(variants.variantPrice[i]);
            const salePrice = parseFloat(variants.salePrice[i]);
            const variantQuantity = parseInt(variants.variantQuantity[i]);

            if (!size || !['6', '7', '8', '9', '10'].includes(size)) {
                return res.status(400).json({ success: false, error: "Invalid size" });
            }

            if (isNaN(variantPrice) || variantPrice <= 0 ||
                isNaN(salePrice) || salePrice < 0 ||
                isNaN(variantQuantity) || variantQuantity < 0) {
                return res.status(400).json({ success: false, error: "Invalid variant details" });
            }

            if (salePrice > variantPrice) {
                return res.status(400).json({ success: false, error: "Sale price can't exceed variant price" });
            }

            if (selectedSizes.has(size)) {
                return res.status(400).json({ success: false, error: "Duplicate sizes not allowed" });
            }

            selectedSizes.add(size);
            variantData.push({ size, variantPrice, salePrice, variantQuantity });
        }

        // Validate category
        const categoryDoc = await Category.findById(data.category);
        if (!categoryDoc || categoryDoc.isDeleted || !categoryDoc.isListed) {
            return res.status(400).json({ success: false, error: "Invalid category" });
        }

        // Images validation (if uploading new images)
        let imagePaths = [];
        if (req.files && req.files.length === 3) {
            imagePaths = req.files.map(file => '/uploads/products/' + file.filename);
        } else {
            imagePaths = req.body.existingImages || [];
        }


        // Update product
        const updatedProduct = await Products.findByIdAndUpdate(
            id,
            {
                productName: data.productName.trim(),
                description: data.description.trim(),
                productOffer: data.productOffer ? parseFloat(data.productOffer) : 0,
                color: data.color.trim(),
                category: categoryDoc._id,
                variants: variantData,
                images: imagePaths
            },
            { new: true }
        );

        return res.status(200).json({ success: true, message: "Product updated successfully" });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: "Internal Server Error" });
    }
};

const deleteProducts =async (req,res)=>{
    try {
        const id=req.params.id
        const products = await Products.findOne({_id:id})

        if(!products){
            return res.status(400).json({success:false,message:"Products not found"})
        }
        await Products.findByIdAndUpdate(id,{isDeleted:true})
        res.json({success:true,message:"Product deleted successfully"})

    } catch (error) {
        console.error(error.message)
        res.status(500).json({success:false,message:" Internal server Error "})
    }
}
module.exports = {
    productsPage,
    loadAddProductPage,
    addProduct,
    blockedProduct,
    unblockedProduct,
    loadEditProduct,
    editProducts,
    deleteProducts
};
