const Products = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
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
            search,
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
        console.log('Form data:', req.body);
        console.log('Files:', req.files);

        const { productName, brand, description, productOffer, color, category, tags, variants } = req.body;

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

        if (brand && (brand.length < 2 || brand.length > 50)) {
            return res.status(400).json({
                success: false,
                error: "Brand must be 2-50 characters if provided",
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

        if (tags && !/^[A-Za-z, ]{1,100}$/.test(tags.trim())) {
            return res.status(400).json({
                success: false,
                error: "Tags must be letters, spaces, or commas (max 100 characters) if provided",
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

        const imagePaths = req.files.map(file => file.path); // Cloudinary URLs

        // Process Tags
        const tagArray = tags ? tags.split(',').map(tag => tag.trim()).filter(tag => tag) : [];

        // Save Product
        const newProduct = new Products({
            productName: productName.trim(),
            brand: brand ? brand.trim() : undefined,
            description: description.trim(),
            productOffer: productOffer ? parseFloat(productOffer) : undefined,
            color: color.trim(),
            category: categoryDoc._id,
            variants: variantData,
            images: imagePaths,
            tags: tagArray,
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



module.exports = {
    productsPage,
    loadAddProductPage,
    addProduct,
};