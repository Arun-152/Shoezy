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
        const totalPages = Math.ceil(totalProducts / limit)
        return res.render("productsPage", {
            products: productsData,
            currentPage: page,
            totalPages: totalPages,
            totalProducts: totalProducts,
            search: search
        });
    } catch (error) {
        console.error("Error in productsPage:", error);
        return res.redirect("/admin/adminErrorPage");
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
        // Extract form data
        const {
            productName,
            description,
            productOffer,
            status,
            color,
            category,
            variants,
        } = req.body;

        // Validate product name
        const trimmedProductName = productName ? productName.trim() : '';
        if (!trimmedProductName || trimmedProductName.length === 0) {
            return res.status(400).json({ error: 'Product name cannot be empty or only spaces.' });
        }
        if (trimmedProductName.length < 2 || trimmedProductName.length > 100) {
            return res.status(400).json({ error: 'Product name must be 2-100 characters' });
        }
        const validNameRegex = /^[a-zA-Z0-9 _-]+$/;
        if (!validNameRegex.test(trimmedProductName)) {
            return res.status(400).json({ error: 'Product name contains invalid characters' });
        }
        const existingProduct = await Product.findOne({
            productName: { $regex: new RegExp(`^${trimmedProductName}$`, 'i') },
            isDeleted: false,
        });
        if (existingProduct) {
            return res.status(400).json({ error: 'This product already exists.' });
        }

        // Validate description
        if (!description || description.trim().length < 10 || description.trim().length > 500) {
            return res.status(400).json({ error: 'Description must be 10-500 characters' });
        }

        // Validate product offer
        let parsedProductOffer = productOffer ? parseFloat(productOffer) : 0;
        if (productOffer && (isNaN(parsedProductOffer) || parsedProductOffer < 0 || parsedProductOffer > 100)) {
            return res.status(400).json({ error: 'Product offer must be between 0-100' });
        }

        // Validate color
        if (!color || !/^[A-Za-z, ]{1,50}$/.test(color.trim())) {
            return res.status(400).json({ error: 'Color must be letters, spaces, or commas (max 50 characters)' });
        }

        // Validate category
        const categoryDoc = await Category.findById(category);
        if (!categoryDoc || categoryDoc.isDeleted || !categoryDoc.isListed) {
            return res.status(400).json({ error: 'Invalid category' });
        }

        // Validate status
        if (!status || !['Available', 'out of stock'].includes(status)) {
            return res.status(400).json({ error: 'Valid product status is required' });
        }

        // Validate variants
        if (!variants || !variants.size || !Array.isArray(variants.size) || variants.size.length === 0) {
            return res.status(400).json({ error: 'At least one valid variant is required' });
        }

        const sizes = variants.size;
        const regularPrices = variants.regularPrice.map(Number);
        const quantities = variants.variantQuantity.map(Number);

        if (sizes.length !== regularPrices.length || sizes.length !== quantities.length) {
            return res.status(400).json({ error: 'Variant fields mismatch' });
        }
        let categoryOffer = 0
        const selectedSizes = new Set();
        const formattedVariants = sizes.map((size, index) => {
            const regularPrice = regularPrices[index];
            const quantity = quantities[index];

            if (!size || !['6', '7', '8', '9', '10'].includes(size)) {
                throw new Error('Invalid size');
            }
            if (isNaN(regularPrice) || regularPrice < 0 || isNaN(quantity) || quantity < 0) {
                throw new Error('Invalid variant details');
            }
            if (selectedSizes.has(size)) {
                throw new Error('Duplicate sizes are not allowed');
            }
            selectedSizes.add(size);
            let salePrice = regularPrice;
            categoryOffer = categoryDoc && categoryDoc.categoryOffer ? parseFloat(categoryDoc.categoryOffer) : 0;
            const maxOffer = Math.max(parsedProductOffer || 0, categoryOffer || 0);
            if (maxOffer > 0) {
               salePrice = Math.round(regularPrice * (1 - maxOffer / 100));
;

            }

            return {
                size,
                regularPrice,
                salePrice,
                variantQuantity: quantity,
            };
        });

        // Validate images
        if (!req.files || req.files.length !== 3) {
            return res.status(400).json({ error: 'Exactly 3 images are required' });
        }
        const imagePaths = req.files.map(file => `/uploads/products/${file.filename}`);

        // Create new product
        const newProduct = new Product({
            productName: trimmedProductName,
            description: description.trim(),
            productOffer: parsedProductOffer,
            bestOffer: Math.max(parsedProductOffer || 0, categoryOffer || 0),
            color: color.trim(),
            category: categoryDoc._id,
            status,
            variants: formattedVariants,
            images: imagePaths,
            isBlocked: false,
            isDeleted: false,
            ratings: { average: 0, count: 0 },
            tags: [],
        });

        // Save product to database
        await newProduct.save();

        // Respond with success
        res.status(200).json({ message: 'Product added successfully' });
    } catch (error) {
        console.error('Error adding product:', error);
        res.status(500).json({ error: error.message || 'Something went wrong' });
    }
};


const blockProduct = async (req, res) => {
    try {
        let id = req.query.id

        await Products.updateOne({ _id: id }, { $set: { isBlocked: true } })
        res.redirect("/admin/products")
    } catch (error) {
        res.redirect("/admin/adminErrorPage")
    }

}

const unblockProduct = async (req, res) => {
    try {
        let id = req.query.id
        await Products.updateOne({ _id: id }, { $set: { isBlocked: false } })
        res.redirect("/admin/products")

    } catch (error) {
        res.redirect("/admin/adminErrorPage")

    }

}
const loadEditProduct = async (req, res) => {
    try {
        const id = req.query.id
        const product = await Products.findOne({ _id: id })
        const category = await Category.find({ isListed: true })

        res.render("editproduct", {
            products: product,
            cat: category,

        })

    } catch (error) {
        res.redirect("/admin/adminErrorPage")

    }
}

const editProducts = async (req, res) => {
    try {
        const id = req.params.id;
        const data = req.body;

        if (!data) {
            return res.status(400).json({ success: false, message: "All fields are required" });
        }

        const trimmedProductName = data.productName ? data.productName.trim() : '';

        if (!trimmedProductName || trimmedProductName.length === 0) {
            return res.status(400).json({
                success: false,
                error: "Product name cannot be empty or only spaces."
            });
        }

        if (trimmedProductName.length < 2 || trimmedProductName.length > 100) {
            return res.status(400).json({
                success: false,
                error: "Product name must be 2-100 characters"
            });
        }

        const validNameRegex = /^[a-zA-Z0-9 _-]+$/;
        if (!validNameRegex.test(trimmedProductName)) {
            return res.status(400).json({
                success: false,
                error: "Product name contains invalid characters"
            });
        }

        const existingProduct = await Products.findOne({
            productName: { $regex: new RegExp(`^${trimmedProductName}$`, 'i') },
            _id: { $ne: id },
            isDeleted: false
        });

        if (existingProduct) {
            return res.status(400).json({
                success: false,
                error: "This product already exists."
            });
        }

        // Description validation
        if (!data.description || data.description.length < 10 || data.description.length > 500) {
            return res.status(400).json({ success: false, error: "Description must be 10-500 characters" });
        }

        // Offer validation
        let parsedProductOffer = data.productOffer ? parseFloat(data.productOffer) : null;
        if (data.productOffer && (isNaN(parsedProductOffer) || parsedProductOffer < 0 || parsedProductOffer > 100)) {
            return res.status(400).json({ success: false, error: "Product offer must be a percentage between 0 and 100" });
        }

        // Color validation
        if (!data.color || !/^[A-Za-z, ]{1,50}$/.test(data.color.trim())) {
            return res.status(400).json({ success: false, error: "Invalid color format" });
        }

        // Status validation
        if (!data.status || !["Available", "out of stock"].includes(data.status)) {
            return res.status(400).json({ success: false, error: "Please select a valid product status" });
        }

        // Variant validation
        const variants = data.variants;
        if (!variants || !variants.size || !Array.isArray(variants.size) || variants.size.length === 0) {
            return res.status(400).json({ success: false, error: "At least one variant required" });
        }

        const variantData = [];
        const selectedSizes = new Set();

        let categoryOffer = 0

        for (let i = 0; i < variants.size.length; i++) {
            const size = variants.size[i];
            const regularPrice = parseFloat(variants.regularPrice[i]);
            const variantQuantity = parseInt(variants.variantQuantity[i]);

            if (!size || !['6', '7', '8', '9', '10'].includes(size)) {
                return res.status(400).json({ success: false, error: "Invalid size" });
            }

            if (isNaN(regularPrice) || regularPrice < 0 || isNaN(variantQuantity) || variantQuantity < 0) {
                return res.status(400).json({ success: false, error: "Invalid variant details" });
            }

            if (selectedSizes.has(size)) {
                return res.status(400).json({ success: false, error: "Duplicate sizes not allowed" });
            }

            selectedSizes.add(size);

            let salePrice = regularPrice;
            const categoryDoc = await Category.findById(data.category);
            categoryOffer = categoryDoc && categoryDoc.categoryOffer ? parseFloat(categoryDoc.categoryOffer) : 0;
            const maxOffer = Math.max(parsedProductOffer || 0, categoryOffer || 0);
            if (maxOffer > 0) {
                salePrice = Math.round(regularPrice * (1 - maxOffer / 100));

            }

            variantData.push({ size, regularPrice, salePrice, variantQuantity });
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
                productOffer: parsedProductOffer || 0,
                color: data.color.trim(),
                bestOffer: Math.max(parsedProductOffer || 0, categoryOffer || 0),
                category: categoryDoc._id,
                variants: variantData,
                images: imagePaths,
                status: data.status
            },
            { new: true }
        );

        return res.status(200).json({ success: true, message: "Product updated successfully" });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: "Internal Server Error" });
    }
};

const deleteProducts = async (req, res) => {
    try {
        const id = req.params.id
        const products = await Products.findOne({ _id: id })

        if (!products) {
            return res.status(400).json({ success: false, message: "Products not found" })
        }
        await Products.findByIdAndUpdate(id, { isDeleted: true })
        res.json({ success: true, message: "Product deleted successfully" })

    } catch (error) {
        console.error(error.message)
        res.status(500).json({ success: false, message: " Internal server Error " })
    }
}

module.exports = {
    productsPage,
    loadAddProductPage,
    addProduct,
    blockProduct,
    unblockProduct,
    loadEditProduct,
    editProducts,
    deleteProducts
};
