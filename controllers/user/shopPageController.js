const User = require("../../models/userSchema");
const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
const Cart = require("../../models/cartSchema");
const Wishlist = require("../../models/wishlistSchema");

const shopPage = async (req, res) => {
    try {
        const userData = req.session.userId;
        const page = parseInt(req.query.page) || 1;
        const limit = 9; // Number of products per page
        const skip = (page - 1) * limit;

        // Build the filter object
        const filter = { isDeleted: false, isBlocked: false };
        if (req.query.category) {
            filter.category = req.query.category;
        }
        if (req.query.search) {
            filter.productName = { $regex: req.query.search, $options: "i" };
        }
        
        // Build the sort object
        const sort = {};
        let sortByPrice = null;
        if (req.query.sortBy) {
            const [sortField, sortOrder] = req.query.sortBy.split('-');
            if (sortField === 'price') {
                sortByPrice = sortOrder; // 'asc' or 'desc'
            } else if (sortField === 'name') {
                sort['productName'] = sortOrder === 'asc' ? 1 : -1;
            } else {
                sort[sortField] = sortOrder === 'asc' ? 1 : -1;
            }
        } else {
            sort.createdAt = -1;
        }

        const productsQuery = Product.find(filter)
            .populate({
                path: "category",
                match: { isListed: true, isDeleted: false }
            })
            .sort(sort)
            .collation({ locale: 'en', strength: 2 }); // strength: 2 for case-insensitivity

        const allProducts = await productsQuery;
        
        // Manual price filtering because of variants
        let filteredProducts = allProducts.filter(p => p.category !== null);
        if (req.query.minPrice || req.query.maxPrice) {
            const minPrice = parseFloat(req.query.minPrice) || 0;
            const maxPrice = parseFloat(req.query.maxPrice) || Infinity;
            filteredProducts = filteredProducts.filter(p => {
                if (p.variants && p.variants.length > 0) {
                    const minSalePrice = Math.min(...p.variants.map(v => v.salePrice));
                    return minSalePrice >= minPrice && minSalePrice <= maxPrice;
                }
                return false;
            });
        }

        // Manual price sorting after all filters are applied
        if (sortByPrice) {
            filteredProducts.sort((a, b) => {
                const getMinPrice = (product) => {
                    if (!product.variants || product.variants.length === 0) return null;
                    const availableVariants = product.variants.filter(v => v.variantQuantity > 0);
                    if (availableVariants.length === 0) return null;
                    return Math.min(...availableVariants.map(v => v.salePrice));
                };

                const priceA = getMinPrice(a);
                const priceB = getMinPrice(b);

                if (sortByPrice === 'asc') {
                    return (priceA ?? Infinity) - (priceB ?? Infinity);
                } else { // 'desc'
                    return (priceB ?? -Infinity) - (priceA ?? -Infinity);
                }
            });
        }

        const totalProducts = filteredProducts.length;
        const totalPages = Math.ceil(totalProducts / limit);
        
        const paginatedProducts = filteredProducts.slice(skip, skip + limit);

        const categories = await Category.find({ isDeleted: false, isListed: true });

        let wishlistItems = [];
        if (userData) {
            const userWishlist = await Wishlist.findOne({ userId: userData });
            if (userWishlist) {
                wishlistItems = userWishlist.products.map(p => p.productId.toString());
            }
        }
        
        const user = await User.findById(userData);

        return res.render("shopPage", {
            products: paginatedProducts,
            categories: categories,
            user: user,
            wishlistItems: wishlistItems,
            cartItems: [], // cartItems was not used in the template for any logic, so sending empty array
            isLandingPage: false,
            currentPage: page,
            totalPages: totalPages,
            hasPrevPage: page > 1,
            hasNextPage: page < totalPages,
            prevPage: page - 1,
            nextPage: page + 1,
            query: req.query
        });
    } catch (error) {
        console.error("Shop page error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};


module.exports = {
    shopPage
}