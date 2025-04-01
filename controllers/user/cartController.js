const Cart = require('../../models/cartSchema');
const Offer = require('../../models/offerSchema');
const Product = require('../../models/productSchema');
// const wishishlist = require('../../models/wishlistSchema');
const User = require('../../models/userScheme');





const getCartPage = async (req, res) => {
    try {
        console.log("Session User ID:", req.session.user);
        const userId = req.session.user;
        if (!userId) {
            return res.render("cart", { cartItems: [], subtotal: 0 });
        }

        // Get current date for offer validation
        const currentDate = new Date();

        // Fetch active offers
        const activeOffers = await Offer.find({
            status: 'active',
            validTill: { $gt: currentDate }
        });

        // Fetch the cart with populated product details
        const cart = await Cart.findOne({ userId })
            .populate({
                path: 'items.productId',
                populate: {
                    path: 'category',
                    select: '_id'
                },
                select: 'productName productImage regularPrice quantity category'
            });

        if (!cart || !cart.items || cart.items.length === 0) {
            return res.render("cart", { cartItems: [], subtotal: 0 });
        }

        // Process each cart item to calculate discounts
        const cartItems = cart.items.map(item => {
            if (!item.productId) return item;

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

            // Ensure quantity is a number
            item.quantity = Number(item.quantity) || 1;

            // Store the final price in the item for easy access
            item.finalPrice = item.productId.discountedPrice || item.productId.regularPrice;

            return item;
        });

        // Calculate subtotal considering discounts
        const subtotal = cartItems.reduce((total, item) => {
            if (item.productId) {
                const price = Number(item.finalPrice) || Number(item.productId.regularPrice) || 0;
                const quantity = Number(item.quantity) || 1;
                return total + (price * quantity);
            }
            return total;
        }, 0);

        // Round the subtotal to avoid floating point issues
        const roundedSubtotal = Math.round(subtotal);

        // Prepare data to send to the view
        const cartData = {
            cartItems,
            subtotal: roundedSubtotal || 0 // Ensure we never send null
        };

        // Add stock error messages from session if present
        if (req.session.stockError) {
            cartData.stockError = req.session.stockError;
            delete req.session.stockError; // Clear the session after using it
        }

        res.render("cart", cartData);

    } catch (error) {
        console.error("Error fetching cart:", error);
        res.status(500).send("Server error");
    }
};


const addToCart = async (req, res) => {
    try {
        const userId = req.session.user;
        const { productId, quantity } = req.body;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Please login to add items to cart"
            });
        }

        // Check if the product exists and has sufficient stock
        const product = await Product.findById(productId).populate('category');
        if (!product) {
            return res.status(404).json({
                success: false,
                message: "Product not found"
            });
        }

        // Get active offers for price calculation
        const currentDate = new Date();
        const activeOffers = await Offer.find({
            status: 'active',
            validTill: { $gt: currentDate }
        });

        // Calculate best discount
        let bestDiscount = 0;

        // Check category offers
        const categoryOffers = activeOffers.filter(offer => 
            offer.type === 'category' && 
            offer.category.some(cat => cat.toString() === product.category._id.toString())
        );
        if (categoryOffers.length > 0) {
            bestDiscount = Math.max(...categoryOffers.map(o => o.discount));
        }

        // Check product-specific offers
        const productOffers = activeOffers.filter(offer => 
            offer.type === 'product' && 
            offer.products.some(p => p.toString() === product._id.toString())
        );
        if (productOffers.length > 0) {
            const maxProductDiscount = Math.max(...productOffers.map(o => o.discount));
            bestDiscount = Math.max(bestDiscount, maxProductDiscount);
        }

        // Calculate final price
        const finalPrice = bestDiscount > 0 
            ? Math.round(product.regularPrice - (product.regularPrice * (bestDiscount/100)))
            : product.regularPrice;

        // Calculate maximum allowed quantity
        const maxAllowed = Math.min(product.quantity, 5);

        // Find the cart for the user
        let cart = await Cart.findOne({ userId: userId });
        
        // Check existing quantity in cart
        let existingQuantity = 0;
        if (cart) {
            const existingItem = cart.items.find(item => 
                item.productId.toString() === productId
            );
            if (existingItem) {
                existingQuantity = existingItem.quantity;
            }
        }

        // Validate total quantity
        const totalQuantity = existingQuantity + quantity;
        if (totalQuantity > maxAllowed) {
            return res.status(400).json({
                success: false,
                message: `Cannot add more items. Maximum allowed quantity is ${maxAllowed}`
            });
        }

        if (!cart) {
            // Create new cart
            cart = new Cart({
                userId: userId,
                items: [{
                    productId: productId,
                    quantity: quantity,
                    price: finalPrice,
                    totalPrice: finalPrice * quantity
                }]
            });
        } else {
            // Update existing cart
            const existingItemIndex = cart.items.findIndex(item => 
                item.productId.toString() === productId
            );

            if (existingItemIndex === -1) {
                // Add new item
                cart.items.push({
                    productId: productId,
                    quantity: quantity,
                    price: finalPrice,
                    totalPrice: finalPrice * quantity
                });
            } else {
                // Update existing item
                const existingItem = cart.items[existingItemIndex];
                existingItem.quantity = totalQuantity;
                existingItem.price = finalPrice;
                existingItem.totalPrice = finalPrice * totalQuantity;
            }
        }

        await cart.save();

        res.json({
            success: true,
            message: "Product added to cart successfully"
        });

    } catch (error) {
        console.log("Error adding to cart:", error);
        res.status(500).json({
            success: false,
            message: "Error adding item to cart"
        });
    }
};

const updateCartItem = async (req, res) => {
    try {
        const userId = req.session.user;
        const { cartItemId, quantity } = req.body;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Please login to update cart"
            });
        }

        // Find the cart and populate product details including category
        const cart = await Cart.findOne({ userId })
            .populate({
                path: 'items.productId',
                populate: {
                    path: 'category',
                    select: '_id'
                }
            });

        if (!cart) {
            return res.status(404).json({
                success: false,
                message: "Cart not found"
            });
        }

        // Find the item in cart
        const cartItem = cart.items.find(item => item._id.toString() === cartItemId);
        if (!cartItem) {
            return res.status(404).json({
                success: false,
                message: "Cart item not found"
            });
        }

        // Get active offers
        const currentDate = new Date();
        const activeOffers = await Offer.find({
            status: 'active',
            validTill: { $gt: currentDate }
        });

        // Calculate best discount for the item
        let bestDiscount = 0;

        // Check category offers
        const categoryOffers = activeOffers.filter(offer => 
            offer.type === 'category' && 
            offer.category.some(cat => cat.toString() === cartItem.productId.category._id.toString())
        );
        if (categoryOffers.length > 0) {
            bestDiscount = Math.max(...categoryOffers.map(o => o.discount));
        }

        // Check product-specific offers
        const productOffers = activeOffers.filter(offer => 
            offer.type === 'product' && 
            offer.products.some(p => p.toString() === cartItem.productId._id.toString())
        );
        if (productOffers.length > 0) {
            const maxProductDiscount = Math.max(...productOffers.map(o => o.discount));
            bestDiscount = Math.max(bestDiscount, maxProductDiscount);
        }

        // Calculate final price
        const finalPrice = bestDiscount > 0 
            ? Math.round(cartItem.productId.regularPrice - (cartItem.productId.regularPrice * (bestDiscount/100)))
            : cartItem.productId.regularPrice;

        // Validate quantity against stock
        if (quantity > cartItem.productId.quantity) {
            return res.status(400).json({
                success: false,
                message: "Requested quantity exceeds available stock",
                availableStock: cartItem.productId.quantity,
                currentQuantity: cartItem.quantity
            });
        }

        // Validate minimum and maximum quantity
        if (quantity < 1) {
            return res.status(400).json({
                success: false,
                message: "Quantity must be at least 1",
                currentQuantity: cartItem.quantity
            });
        }

        if (quantity > 5) {
            return res.status(400).json({
                success: false,
                message: "Maximum 5 quantities allowed per product",
                currentQuantity: cartItem.quantity
            });
        }

        // Update quantity and price
        cartItem.quantity = quantity;
        cartItem.price = finalPrice;
        cartItem.totalPrice = finalPrice * quantity;
        await cart.save();

        // Calculate new totals considering all discounts
        const newItemTotal = finalPrice * quantity;
        const newSubtotal = cart.items.reduce((sum, item) => {
            return sum + item.totalPrice;
        }, 0);

        res.json({
            success: true,
            message: "Cart updated successfully",
            newItemTotal: newItemTotal,
            newSubtotal: newSubtotal
        });

    } catch (error) {
        console.error("Error updating cart:", error);
        res.status(500).json({
            success: false,
            message: "Error updating cart"
        });
    }
};



const removeCartItem = async (req, res) => {
    try {
        const userId = req.session.user;
        const { cartItemId } = req.body;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Please login to remove items"
            });
        }

        // Find and update the cart using $pull operator
        const cart = await Cart.findOneAndUpdate(
            { userId },
            { $pull: { items: { _id: cartItemId } } },
            { new: true }
        ).populate({
            path: 'items.productId',
            populate: {
                path: 'category',
                select: '_id'
            }
        });

        if (!cart) {
            return res.status(404).json({
                success: false,
                message: "Cart not found"
            });
        }

        // Calculate new subtotal using the stored totalPrice
        const newSubtotal = cart.items.reduce((sum, item) => {
            return sum + item.totalPrice;
        }, 0);

        res.json({
            success: true,
            message: "Item removed successfully",
            newSubtotal: newSubtotal
        });

    } catch (error) {
        console.error("Error removing cart item:", error);
        res.status(500).json({
            success: false,
            message: "Error removing item from cart"
        });
    }
};




module.exports = {
    getCartPage,
    addToCart,
    updateCartItem,
    removeCartItem   
    
}