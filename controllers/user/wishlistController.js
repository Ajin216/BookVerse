const Wishlist = require('../../models/wishlistSchema');
const mongoose = require('mongoose');
const Cart = require('../../models/cartSchema');
// const Offer = require('../../models/offerModel');
const User=require("../../models/userScheme");
const Product=require("../../models/productSchema");



const getWishlistpage = async (req, res) => {
    try {
        const userId = req.session.user;
        // console.log("Current userId from session:", userId); // Debug log
        
        if (!userId) {
            console.log("No user found in session");
            return res.render("wishlist", { wishlist: null });
        }

        // Check if wishlist exists for this user
        const wishlistExists = await Wishlist.exists({ userId: userId });
        // console.log("Does wishlist exist?", wishlistExists); // Debug log

        // Find wishlist and populate product details
        const wishlistData = await Wishlist.findOne({ userId: userId })
            .populate({
                path: 'products.productId',
                model: 'Product',
                select: 'productName productImage salePrice regularPrice productOffer quantity status'
            });

        // console.log("Raw wishlist data:", wishlistData); // Debug log

        // If no wishlist exists, create an empty structure
        const wishlistToRender = wishlistData || {
            userId: userId,
            products: []
        };

        console.log("Data being sent to render:", JSON.stringify(wishlistToRender, null, 2)); // Debug log

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