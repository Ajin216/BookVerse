const Order = require('../../models/orderSchema');
const User = require("../../models/userScheme");
const Product = require('../../models/productSchema');
const Address = require('../../models/addressSchema');
const Cart = require('../../models/cartSchema');
const Wallet = require('../../models/walletSchema')
const Razorpay = require('razorpay');
const crypto = require('crypto');
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});


const getOrderPage = async (req, res) => {
    try {
        const userId = req.session.user;
        
        // Pagination parameters
        const page = parseInt(req.query.page) || 1;
        const limit = 15; // Number of orders per page
        const skip = (page - 1) * limit;

        // Fetch total count of orders
        const totalOrders = await Order.countDocuments({ userId: userId });

        // Calculate total pages
        const totalPages = Math.ceil(totalOrders / limit);

        // Fetch paginated orders
        const orders = await Order.find({ userId: userId })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        res.render("orders", { 
            orders: orders,
            title: "My Orders",
            pagination: {
                currentPage: page,
                totalPages: totalPages,
                hasNextPage: page < totalPages,
                hasPreviousPage: page > 1,
                nextPage: page + 1,
                previousPage: page - 1
            }
        });
    } catch (error) {
        console.error("Comprehensive Order Page Error:", error);
        res.status(500).render('error', { 
            message: 'Detailed Order Retrieval Error',
            error: error.message,
            fullError: error
        });
    }
};





const getOrderSummary = async (req, res) => {
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

        // The addresses is now an object, not an array, so directly use it
        const orderAddress = order.addresses;

        // Calculate subtotals for each item (now using the existing total in the schema)
        const itemsWithDetails = order.items.map(item => ({
            ...item.toObject(),
            subtotal: item.total, // Using the total already calculated in the schema
            productName: item.name,
            productStatus: item.status
        }));

        res.render('orderSummary', { 
            order: order,
            items: itemsWithDetails,
            address: orderAddress,
            orderId: order.orderId,
            paymentMethod: order.paymentMethod,
            paymentStatus: order.payment_status,
            orderStatus: order.order_status,
            totalPrice: order.totalPrice,
            shippingCost: order.shipping_cost,
            tax: order.tax,
            discount: order.discount
        });
    } catch (error) {
        console.error('Error fetching order details:', error);
        res.status(500).render('error', { 
            message: 'Error retrieving order details',
            error: error.message 
        });
    }
};




const cancelOrderItem = async (req, res) => {
    try {
        const { orderId, itemId } = req.params;
        const order = await Order.findOne({ orderId: orderId });

        if (!order) {
            return res.status(404).json({ 
                success: false, 
                message: 'Order not found' 
            });
        }

        const item = order.items.find(item => 
            item._id.toString() === itemId
        );

        if (!item) {
            return res.status(404).json({ 
                success: false, 
                message: 'Item not found in the order' 
            });
        }

        // Only process if item wasn't already cancelled
        if (item.status !== 'Cancelled') {
            // Get the exact amount this item contributes to the total
            const itemPrice = Math.round(item.price);
            const itemQuantity = item.quantity;
            const itemTotalBeforeDiscount = Math.round(itemPrice * itemQuantity);
            
            // Calculate this item's coupon discount amount (if any)
            const itemCouponDiscount = item.couponDiscount || 0;
            
            // Calculate this item's exact contribution to the final total
            let itemContributionToTotal;
            
            if (order.discount > 0) {
                // If there's a coupon discount applied, we need to determine this item's exact share
                // First, get the original subtotal of all items before discount
                const originalSubtotal = Math.round(order.items.reduce((total, item) => 
                    total + (item.quantity * item.price), 0));
                
                // Calculate what percentage of the original subtotal this item represents
                const itemPercentage = itemTotalBeforeDiscount / originalSubtotal;
                
                // Calculate this item's exact contribution to the final total price
                itemContributionToTotal = Math.round(order.totalPrice * itemPercentage);
            } else {
                // If no coupon, the item's contribution is simply its price * quantity
                itemContributionToTotal = itemTotalBeforeDiscount;
            }
            
            // Update quantity in stock
            await Product.findByIdAndUpdate(item.productId, {
                $inc: { quantity: item.quantity }
            });
            
            // Update item status
            item.status = 'Cancelled';
            
            // Calculate the new total by subtracting this item's exact contribution
            const newTotalPrice = Math.max(0, Math.round(order.totalPrice - itemContributionToTotal));
            
            // Calculate the new discount by subtracting this item's coupon discount
            const newDiscount = Math.max(0, Math.round(order.discount - itemCouponDiscount));
            
            // Add the exact refund amount to wallet
            const wallet = await Wallet.findOne({ user_id: order.userId });
            if (wallet) {
                wallet.balance = Math.round(wallet.balance + itemContributionToTotal);
                wallet.history.push({
                    amount: itemContributionToTotal,
                    transaction_type: 'credit',
                    description: `Refund for cancelled item from order ${order.orderId}`,
                    transaction_id: `REF-${Date.now()}`
                });
                await wallet.save();
            }

            // Update order total price and discount
            order.totalPrice = newTotalPrice;
            order.discount = newDiscount;

            // Check if all items are cancelled
            const allItemsCancelled = order.items.every(item => item.status === 'Cancelled');
            if (allItemsCancelled) {
                order.order_status = 'Cancelled';
                order.totalPrice = 0;
                order.discount = 0;
            }

            await order.save();
        }

        res.json({ 
            success: true, 
            message: 'Item successfully cancelled',
            updatedTotalPrice: order.totalPrice,
            updatedDiscount: order.discount,
            orderStatus: order.order_status
        });
    } catch (error) {
        console.error('Error canceling order item:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error canceling order item',
            error: error.message 
        });
    }
};



const cancelAllOrders = async (req, res) => {
    try {
        const orderId = req.params.orderId;
        const { cancelReason } = req.body;

        const order = await Order.findOne({ orderId: orderId });

        if (!order) {
            return res.status(404).json({ 
                success: false, 
                message: 'Order not found' 
            });
        }

        if (order.order_status === 'Cancelled') {
            return res.status(400).json({ 
                success: false, 
                message: 'Order is already cancelled' 
            });
        }

        // Calculate refund amount before cancelling items - ROUNDED
        const refundAmount = Math.round(order.totalPrice); // Total price already includes any discounts

        // Return items to stock only if they weren't already cancelled
        for (const item of order.items) {
            if (item.status !== 'Cancelled') {
                await Product.findByIdAndUpdate(item.productId, {
                    $inc: { quantity: item.quantity }
                });
                item.status = 'Cancelled';
            }
        }

        // Add refund amount to wallet - ROUNDED
        const wallet = await Wallet.findOne({ user_id: order.userId });
        if (wallet && refundAmount > 0) {
            wallet.balance = Math.round(wallet.balance + refundAmount);
            wallet.history.push({
                amount: refundAmount,
                transaction_type: 'credit',
                description: `Refund for cancelled order ${order.orderId}`,
                transaction_id: `REF-${Date.now()}`
            });
            await wallet.save();
        }

        // Set order status, reset total price and discount
        order.order_status = 'Cancelled';
        order.cancelReason = cancelReason || 'Customer request';
        order.totalPrice = 0;
        order.discount = 0;

        await order.save();

        res.json({ 
            success: true, 
            message: 'Order successfully cancelled'
        });
    } catch (error) {
        console.error('Error canceling entire order:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error canceling order',
            error: error.message 
        });
    }
};




const requestReturnOrder = async (req, res) => {
    try {
        const itemId = req.params.itemId;
        const { returnReason } = req.body;

        // Validate returnReason
        if (!returnReason || returnReason.trim() === '') {
            return res.status(400).json({ 
                success: false, 
                message: 'Return reason is required' 
            });
        }

        // Find the order and item
        const order = await Order.findOne({ "items._id": itemId });
        
        if (!order) {
            return res.status(404).json({ 
                success: false, 
                message: 'Order not found' 
            });
        }

        // Find the specific item
        const itemIndex = order.items.findIndex(item => item._id.toString() === itemId);
        
        if (itemIndex === -1) {
            return res.status(404).json({ 
                success: false, 
                message: 'Item not found in order' 
            });
        }

        const item = order.items[itemIndex];

        // Check if item is eligible for return
        if (['Cancelled', 'Returned', 'Return Requested', 'Rejected'].includes(item.status)) {
            return res.status(400).json({ 
                success: false, 
                message: `Item cannot be returned (Current status: ${item.status})` 
            });
        }

        // Update item status to "Return Requested"
        item.status = 'Return Requested';
        
        // Store the return reason
        order.returnReason = returnReason;
        
        // Check if any other items are in Return Requested status
        const anyOtherReturnRequested = order.items.some((item, idx) => 
            idx !== itemIndex && item.status === 'Return Requested');
            
        // If no other items are in Return Requested status, update order status
        if (!anyOtherReturnRequested) {
            order.order_status = 'Return Requested';
        }

        // Save the changes
        await order.save();

        res.json({ 
            success: true, 
            message: 'Return request submitted successfully',
            newStatus: 'Return Requested'
        });

    } catch (error) {
        console.error('Error requesting return:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to submit return request',
            error: error.message 
        });
    }
};



const retryPayment = async (req, res) => {
    try {
        const orderId = req.params.orderId;
        const order = await Order.findOne({ orderId: orderId });

        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        // Initialize Razorpay with correct environment variable names
        const razorpay = new Razorpay({
            key_id: process.env.RAZORPAY_KEY_ID,
            key_secret: process.env.RAZORPAY_KEY_SECRET  // Changed from SECRET_KEY to KEY_SECRET
        });

        // Create Razorpay order
        const razorpayOrder = await razorpay.orders.create({
            amount: Math.round(order.totalPrice * 100),
            currency: 'INR',
            receipt: order.orderId,
        });

        res.json({
            success: true,
            order: razorpayOrder,
            key_id: process.env.RAZORPAY_KEY_ID
        });

    } catch (error) {
        console.error('Error in retry payment:', error);
        res.status(500).json({
            success: false,
            message: 'Error processing payment retry',
            error: error.message
        });
    }
};



const verifyRetryPayment = async (req, res) => {
    try {
        const {
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
            order_id
        } = req.body;

        // Verify signature
        const sign = razorpay_order_id + "|" + razorpay_payment_id;
        const expectedSign = crypto
            .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)  // Changed from SECRET_KEY to KEY_SECRET
            .update(sign.toString())
            .digest("hex");

        if (razorpay_signature !== expectedSign) {
            return res.status(400).json({
                success: false,
                message: 'Invalid signature'
            });
        }

        // Update order payment status
        const order = await Order.findOneAndUpdate(
            { orderId: order_id },
            { 
                payment_status: 'Paid',
                razorpay_payment_id,
                razorpay_order_id
            },
            { new: true }
        );

        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        res.json({
            success: true,
            message: 'Payment successful'
        });

    } catch (error) {
        console.error('Error in payment verification:', error);
        res.status(500).json({
            success: false,
            message: 'Error verifying payment',
            error: error.message
        });
    }
};




module.exports={
    getOrderPage,
    getOrderSummary,
    cancelOrderItem,
    cancelAllOrders,
    // returnOrderItem,
    retryPayment,
    verifyRetryPayment,
    requestReturnOrder

}