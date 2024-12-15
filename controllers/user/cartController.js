const Cart = require('../../models/cartSchema');
// const Offer = require('../../models/offerModel');
const Product = require('../../models/productSchema');
// const wishishlist = require('../../models/wishlistSchema');
const User = require('../../models/userScheme');





const getCartPage = async (req, res) => {
    try {
        // Check if user is logged in
        console.log("Session User ID:", req.session.user); 
        const userId = req.session.user; // Ensure this matches your session key
        if (!userId) {
            return res.render("cart", { cartItems: [], subtotal: 0 });
        }

        // Fetch the cart for the user and populate product details
        const cart = await Cart.findOne({ userId })
            .populate({
                path: 'items.productId',
                select: 'productName productImage salePrice quantity' // Fetch only necessary fields
            });

        if (!cart || !cart.items || cart.items.length === 0) {
            // If no items in cart, render empty cart
            return res.render("cart", { cartItems: [], subtotal: 0 });
        }

        // Calculate subtotal
        const cartItems = cart.items;
        const subtotal = cartItems.reduce((total, item) => {
            if (item.productId) {
                return total + (item.productId.salePrice * item.quantity);
            }
            return total;
        }, 0);

        res.render("cart", {
            cartItems,
            subtotal
        });

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
        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({
                success: false,
                message: "Product not found"
            });
        }

        // Calculate maximum allowed quantity
        const maxAllowed = Math.min(product.quantity, 5);

        // Find the cart for the user
        let cart = await Cart.findOne({ userId: userId });
        
        // Check existing quantity in cart (if exists)
        let existingQuantity = 0;
        if (cart) {
            const existingItem = cart.items.find(item => 
                item.productId.toString() === productId
            );
            if (existingItem) {
                existingQuantity = existingItem.quantity;
            }
        }

        // Validate total quantity (existing + new)
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
                    price: product.salePrice,
                    totalPrice: product.salePrice * quantity
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
                    price: product.salePrice,
                    totalPrice: product.salePrice * quantity
                });
            } else {
                // Update existing item
                const existingItem = cart.items[existingItemIndex];
                existingItem.quantity = totalQuantity;
                existingItem.totalPrice = existingItem.price * totalQuantity;
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





// Update cart item quantity
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

        // Find the cart and populate product details
        const cart = await Cart.findOne({ userId })
            .populate('items.productId');

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

        // Validate quantity against stock
        if (quantity > cartItem.productId.quantity) {
            return res.status(400).json({
                success: false,
                message: "Requested quantity exceeds available stock",
                availableStock: cartItem.productId.quantity,
                currentQuantity: cartItem.quantity
            });
        }

        // Validate minimum quantity
        if (quantity < 1) {
            return res.status(400).json({
                success: false,
                message: "Quantity must be at least 1",
                currentQuantity: cartItem.quantity
            });
        }

        // Validate maximum quantity limit
        if (quantity > 5) {
            return res.status(400).json({
                success: false,
                message: "Maximum 5 quantities allowed per product",
                currentQuantity: cartItem.quantity
            });
        }

        // Update quantity
        cartItem.quantity = quantity;
        await cart.save();

        // Calculate new totals
        const newItemTotal = cartItem.productId.salePrice * quantity;
        const newSubtotal = cart.items.reduce((sum, item) => {
            return sum + (item.productId.salePrice * item.quantity);
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



// Remove item from cart
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
        ).populate('items.productId');

        if (!cart) {
            return res.status(404).json({
                success: false,
                message: "Cart not found"
            });
        }

        // Calculate new subtotal
        const newSubtotal = cart.items.reduce((sum, item) => {
            return sum + (item.productId.salePrice * item.quantity);
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