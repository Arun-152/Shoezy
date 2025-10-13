
const calculateBestOffer = (regularPrice, productOffer = 0, categoryOffer = 0) => {
    const offers = [];

    if (productOffer > 0) {
        offers.push({
            source: 'product',
            type: 'percentage',
            value: productOffer,
            discountAmount: regularPrice * (productOffer/ 100)
        });
    }

    if (categoryOffer > 0) {
        offers.push({
            source: 'category',
            type: 'percentage',
            value: categoryOffer,
            discountAmount: regularPrice * (categoryOffer/ 100)
        });
    }

    if (offers.length === 0) return { salePrice: regularPrice, appliedOffer: null };

    const bestOffer = offers.reduce((max, offer) => offer.discountAmount > max.discountAmount ? offer : max, offers[0]);
    const salePrice = Math.round(Math.max(regularPrice - bestOffer.discountAmount, 0).toFixed(2));

    return { salePrice, appliedOffer: bestOffer };
};

module.exports = calculateBestOffer;