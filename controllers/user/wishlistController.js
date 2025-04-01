const Wishlist = require('../../models/wishlistSchema');
const mongoose = require('mongoose');
const Cart = require('../../models/cartSchema');
const Offer = require('../../models/offerSchema');
const User=require("../../models/userScheme");
const Product=require("../../models/productSchema");



const getWishlistpage = async (req, res) => {
    try {
        const userId = req.session.user;
        
        if (!userId) {
            return res.render("wishlist", { wishlist: null });
        }

        // Get current date for offer validation
        const currentDate = new Date();

        // Fetch active offers
        const activeOffers = await Offer.find({
            status: 'active',
            validTill: { $gt: currentDate }
        });

        // Find wishlist and populate product details
        let wishlistData = await Wishlist.findOne({ userId: userId })
            .populate({
                path: 'products.productId',
                model: 'Product',
                populate: {
                    path: 'category',
                    select: '_id'
                },
                select: 'productName productImage regularPrice quantity status category'
            });

        if (wishlistData) {
            // Filter out products that no longer exist
            wishlistData.products = wishlistData.products.filter(item => item.productId !== null);
            
            // Save the filtered wishlist if any products were removed
            await wishlistData.save();

            // Process remaining products for discounts
            wishlistData.products = wishlistData.products.map(item => {
                // Ensure regularPrice exists and is a number
                item.productId.regularPrice = Number(item.productId.regularPrice) || 0;
                let bestDiscount = 0;

                // Check category offers
                const categoryOffers = activeOffers.filter(offer => 
                    offer.type === 'category' && 
                    offer.category.some(cat => cat.toString() === item.productId.category._id.toString())
                );

                if (categoryOffers.length > 0) {
                    const maxCategoryDiscount = Math.max(...categoryOffers.map(o => Number(o.discount) || 0));
                    bestDiscount = maxCategoryDiscount;
                }

                // Check product-specific offers
                const productOffers = activeOffers.filter(offer => 
                    offer.type === 'product' && 
                    offer.products.some(p => p.toString() === item.productId._id.toString())
                );

                if (productOffers.length > 0) {
                    const maxProductDiscount = Math.max(...productOffers.map(o => Number(o.discount) || 0));
                    bestDiscount = Math.max(bestDiscount, maxProductDiscount);
                }

                // Calculate discounted price if there's an active discount
                if (bestDiscount > 0) {
                    const discountAmount = (item.productId.regularPrice * (bestDiscount/100));
                    item.productId.discountedPrice = Math.round(item.productId.regularPrice - discountAmount);
                    item.productId.bestDiscount = bestDiscount;
                }

                return item;
            });
        }

        const wishlistToRender = wishlistData || {
            userId: userId,
            products: []
        };

        res.render("wishlist", {
            wishlist: wishlistToRender,
            user: req.session.user
        });

    } catch (error) {
        console.error("Error in getWishlistpage:", error);
        res.status(500).send("Server error");
    }
};



const addToWishlist = async (req, res) => {
    try {
        const userId = req.session.user;
        const { productId } = req.body;

        console.log("Adding to wishlist - userId:", userId, "productId:", productId);

        const userObjectId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;

        let wishlist = await Wishlist.findOne({ userId: userObjectId });
        console.log("Existing wishlist:", wishlist);

        if (!wishlist) {
            wishlist = new Wishlist({
                userId: userObjectId,
                products: [{ productId: new mongoose.Types.ObjectId(productId) }]
            });
            console.log("Created new wishlist:", wishlist);
        } else {
            const existingProduct = wishlist.products.find(
                item => item.productId.toString() === productId.toString()
            );

            if (!existingProduct) {
                wishlist.products.push({ productId: new mongoose.Types.ObjectId(productId) });
                console.log("Added new product to existing wishlist");
            } else {
                console.log("Product already exists in wishlist");
                return res.json({ 
                    success: true, 
                    message: 'This item is already in your wishlist!',
                    isExisting: true 
                });
            }
        }

        const savedWishlist = await wishlist.save();
        console.log("Saved wishlist:", savedWishlist);
        
        res.json({ 
            success: true, 
            message: 'Item successfully added to your wishlist!' 
        });

    } catch (error) {
        console.error("Error in adding to wishlist:", error);
        res.status(500).json({ 
            success: false, 
            error: "Unable to add item to wishlist. Please try again." 
        });
    }
};



const removeFromWishlist = async (req, res) => {
    try {
        const userId = req.session.user;
        const productId = req.params.productId;

        const wishlist = await Wishlist.findOne({ userId: userId });

        if (wishlist) {
            wishlist.products = wishlist.products.filter(
                item => item.productId.toString() !== productId
            );
            await wishlist.save();
        }

        res.json({ success: true });

    } catch (error) {
        console.log("error in removing from wishlist:", error);
        res.status(500).json({ success: false, error: "Server error" });
    }
};


module.exports={
    getWishlistpage,
    addToWishlist,
    removeFromWishlist
}