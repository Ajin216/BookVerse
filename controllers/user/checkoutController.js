const Order = require('../../models/orderSchema');
const User = require("../../models/userScheme");
const Product = require('../../models/productSchema');
const Address = require('../../models/addressSchema');
const Cart = require('../../models/cartSchema');
// const Razorpay = require('razorpay');
// const crypto = require('crypto');
// const mongoose = require('mongoose');
// const Offer = require('../../models/offerModel');
// const Coupon = require('../../models/couponModel')
// const Wallet = require('../../models/')
// const Wishlist = require('../../models/wishlistModel');





const getCheckoutPage = async (req, res) => {
    try {
        // Check if user is logged in
        const userId = req.session.user;
        if (!userId) {
            return res.redirect('/login');
        }

        // Find the user
        const user = await User.findById(userId);
        if (!user) {
            return res.redirect('/login');
        }

        // Fetch addresses for the logged-in user
        const addresses = await Address.find({ userId });

        // Fetch the cart and populate product details
        const cart = await Cart.findOne({ userId })
            .populate({
                path: 'items.productId',
                select: 'productName productImage salePrice quantity'
            });

        // Calculate subtotal
        const cartItems = cart?.items || [];
        const subtotal = cartItems.reduce((total, item) => {
            if (item.productId) {
                return total + (item.productId.salePrice * item.quantity);
            }
            return total;
        }, 0);

        // Render checkout page
        res.render("checkout", { 
            addresses,
            user,
            cartItems,
            subtotal
        });

    } catch (error) {
        console.error("Checkout page error:", error);
        res.status(500).render('error', { 
            message: 'Error loading checkout page',
            error: error.message
        });
    }
};





const placeOrder = async (req, res) => {
    try {
        // Get user and selected address from request body
        const userId = req.session.user;
        const { selectedAddressId, paymentMethod } = req.body;

        // Validate inputs
        if (!userId) {
            return res.status(401).render('error', { 
                message: 'User Authentication Error',
                error: 'Please log in to place an order'
            });
        }

        if (!selectedAddressId) {
            return res.status(400).render('error', { 
                message: 'Address Selection Error',
                error: 'Please select a shipping address'
            });
        }

        if (!paymentMethod) {
            return res.status(400).render('error', { 
                message: 'Payment Method Error',
                error: 'Please select a payment method'
            });
        }

        // Verify the address exists and fetch full address details
        const address = await Address.findById(selectedAddressId);
        if (!address) {
            return res.status(400).render('error', { 
                message: 'Invalid Address',
                error: 'Selected address is invalid'
            });
        }

        // Find user's cart and populate product details
        const cart = await Cart.findOne({ userId }).populate({
            path: 'items.productId',
            select: 'productName salePrice quantity'
        });

        if (!cart || cart.items.length === 0) {
            return res.status(400).render('error', { 
                message: 'Empty Cart',
                error: 'Your cart is empty'
            });
        }

        // Prepare order items and check product availability
        const orderItems = [];
        let totalPrice = 0;

        for (let item of cart.items) {
            // Check product availability
            const product = await Product.findById(item.productId._id);
            
            if (!product) {
                return res.status(400).render('error', { 
                    message: 'Product Not Found',
                    error: `Product not found: ${item.productId._id}`
                });
            }

            if (product.quantity < item.quantity) {
                return res.status(400).render('error', { 
                    message: 'Insufficient Stock',
                    error: `Insufficient stock for product: ${product.productName}`
                });
            }

            // Reduce product quantity
            product.quantity -= item.quantity;
            await product.save();

            // Create order item
            orderItems.push({
                productId: item.productId._id,
                name: product.productName,
                quantity: item.quantity,
                price: item.productId.salePrice,
                total: item.productId.salePrice * item.quantity
            });

            // Calculate total price
            totalPrice += item.productId.salePrice * item.quantity;
        }

        // Create order ID generator
        const generateOrderId = () => {
            const timestamp = Date.now().toString(36);
            const randomStr = Math.random().toString(36).substr(2, 5).toUpperCase();
            return `ORD-${timestamp}-${randomStr}`;
        };

        // Create new order with address as an object
        const newOrder = new Order({
            userId,
            addresses: {
                userId: address.userId,
                addressName: address.addressName,
                addressMobile: address.addressMobile,
                addressHouse: address.addressHouse,
                addressPost: address.addressPost,
                addressDistrict: address.addressDistrict,
                addressState: address.addressState,
                addressPin: address.addressPin,
                is_default: address.is_default || false
            },
            items: orderItems,
            totalPrice,
            paymentMethod,
            orderId: generateOrderId(),
            payment_status: paymentMethod === 'Cash on Delivery' ? 'Pending' : 'Completed',
            order_status: 'Pending',
            deliveryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days from now
        });

        // Save order
        const savedOrder = await newOrder.save();

        // Clear the cart after successful order
        await Cart.findOneAndUpdate(
            { userId }, 
            { $set: { items: [] } }
        );

        // Render order confirmation page
        res.render('orderConfirmation', { 
            orderId: newOrder.orderId
        });

    } catch (error) {
        console.error('Place Order Error:', error);
        
        // Render a more informative error page
        res.status(500).render('pageNotFound', { 
            message: 'Order Placement Failed',
            error: error.message || 'An unexpected error occurred'
        });
    }
};








const getOrderDetails = async (req, res) => {
    try {
        const orderId = req.params.orderId;
        
        // Find order by the custom orderId
        const order = await Order.findOne({ orderId: orderId })
            .populate({
                path: 'items.productId',
                populate: {
                    path: 'category',
                    model: 'Category'
                }
            })
            .populate('userId');

        if (!order) {
            return res.status(404).render('error', { 
                message: 'Order not found',
                error: 'The requested order could not be found'
            });
        }

        // Calculate subtotal for each item
        const itemsWithSubtotal = order.items.map(item => ({
            ...item.toObject(), // Convert to plain object
            subtotal: item.quantity * item.price
        }));

        res.render('orderDetails', { 
            order: order,
            items: itemsWithSubtotal,
            address: order.addresses, // Now directly using the addresses object
            orderId: order.orderId
        });
    } catch (error) {
        console.error('Error fetching order details:', error);
        res.status(500).render('error', { 
            message: 'Error retrieving order details',
            error: error.message 
        });
    }
};





// const addnewAddress = async (req, res) => {
//     try {
//         // Validate user session
//         if (!req.session.user) {
//             return res.status(401).json({ message: 'Please login to add address' });
//         }

//         // Destructure and validate input
//         const { 
//             addressName, 
//             addressHouse, 
//             addressPost, 
//             addressDistrict, 
//             addressState, 
//             addressMobile, 
//             addressPin 
//         } = req.body;

//         // Validation logic (keep your existing validation)
//         const validationErrors = [];

//         // Name validation
//         if (!addressName || addressName.length < 2 || addressName.length > 50) {
//             validationErrors.push('Invalid name. Must be 2-50 characters.');
//         }

//         // Mobile validation
//         const mobileRegex = /^[6-9]\d{9}$/;
//         if (!addressMobile || !mobileRegex.test(addressMobile)) {
//             validationErrors.push('Invalid mobile number');
//         }

//         // PIN code validation
//         const pinRegex = /^\d{6}$/;
//         if (!addressPin || !pinRegex.test(addressPin.toString())) {
//             validationErrors.push('Invalid PIN code');
//         }

//         // Additional field validations
//         const requiredFields = [
//             'addressHouse', 'addressPost', 
//             'addressDistrict', 'addressState'
//         ];

//         requiredFields.forEach(field => {
//             if (!req.body[field] || req.body[field].trim().length < 2) {
//                 validationErrors.push(`Invalid ${field.replace('address', '')}`);
//             }
//         });

//         // Return validation errors if any
//         if (validationErrors.length > 0) {
//             return res.status(400).json({ 
//                 message: 'Validation failed', 
//                 errors: validationErrors 
//             });
//         }

//         // Create new address
//         const newAddress = new Address({
//             userId: req.session.user.toString(),
//             ...req.body,
//             addressPin: parseInt(addressPin)
//         });
        
//         // Save address
//         const savedAddress = await newAddress.save();
        
//         res.status(201).json({ 
//             success: true, 
//             message: 'Address added successfully',
//             addressId: savedAddress._id,
//             address: savedAddress
//         });
//     } catch (error) {
//         console.error('Error adding address:', error);
//         res.status(500).json({ 
//             message: 'Failed to add address',
//             error: error.message 
//         });
//     }
// };



// const editAddress = async (req, res) => {
//     try {
//         // Destructure and validate incoming data
//         const { 
//             addressId,
//             addressName, 
//             addressHouse, 
//             addressPost, 
//             addressDistrict, 
//             addressState, 
//             addressMobile, 
//             addressPin 
//         } = req.body;

//         // Comprehensive server-side validations
//         const validationErrors = [];

//         // Ensure user is logged in
//         if (!req.session.user) {
//             return res.status(401).json({ message: 'Please login to update address' });
//         }

//         // Name validation
//         if (!addressName || addressName.length < 2) {
//             validationErrors.push('Name must be at least 2 characters long');
//         }

//         // Mobile number validation
//         const mobileRegex = /^[6-9]\d{9}$/;
//         if (!addressMobile || !mobileRegex.test(addressMobile)) {
//             validationErrors.push('Invalid mobile number');
//         }

//         // PIN code validation
//         const pinRegex = /^\d{6}$/;
//         if (!addressPin || !pinRegex.test(addressPin)) {
//             validationErrors.push('PIN code must be 6 digits');
//         }

//         // House address validation
//         if (!addressHouse || addressHouse.length < 3) {
//             validationErrors.push('House address is too short');
//         }

//         // Return validation errors if any
//         if (validationErrors.length > 0) {
//             return res.status(400).json({ 
//                 message: 'Validation failed',
//                 errors: validationErrors
//             });
//         }

//         // Find and update the address
//         const updatedAddress = await Address.findOneAndUpdate(
//             { 
//                 _id: addressId, 
//                 userId: req.session.user.toString() 
//             }, 
//             {
//                 addressName,
//                 addressHouse,
//                 addressPost,
//                 addressDistrict,
//                 addressState,
//                 addressMobile,
//                 addressPin: parseInt(addressPin)
//             },
//             { 
//                 new: true,  // Return the updated document
//                 runValidators: true  // Run model validations
//             }
//         );

//         if (!updatedAddress) {
//             return res.status(404).json({ message: 'Address not found or you do not have permission to update' });
//         }

//         // Successful response with detailed message
//         res.status(200).json({ 
//             success: true, 
//             message: 'Address updated successfully',
//             address: updatedAddress
//         });
//     } catch (error) {
//         // Detailed error logging
//         console.error('Error updating address:', error);
        
//         // Determine the type of error and send appropriate response
//         if (error.name === 'ValidationError') {
//             return res.status(400).json({ 
//                 message: 'Validation error',
//                 errors: Object.values(error.errors).map(err => err.message)
//             });
//         }

//         // Generic server error
//         res.status(500).json({ 
//             message: 'Failed to update address',
//             error: error.message || 'Internal server error'
//         });
//     };
// };





module.exports={
    getCheckoutPage,
    // addnewAddress,
    // editAddress,
    placeOrder,
    getOrderDetails 

}