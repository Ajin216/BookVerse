const Order= require('../../models/orderSchema');
const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const User = require("../../models/userScheme");
const Wallet = require('../../models/walletSchema')


const getAdminOrderPage = async (req, res) => {
    try {
        // Get page number from query params (default to page 1)
        const page = parseInt(req.query.page) || 1;
        // Set items per page
        const limit = 15;
        // Calculate skip value for pagination
        const skip = (page - 1) * limit;

        // Count total documents for pagination
        const totalOrders = await Order.countDocuments();
        
        // Calculate total pages
        const totalPages = Math.ceil(totalOrders / limit);

        // Fetch paginated orders with populated user and product details
        const orders = await Order.find()
            .populate({
                path: 'userId', 
                select: 'name email'
            })
            .populate({
                path: 'items.productId', 
                select: 'productName productImage'
            })
            .sort({ createdAt: -1 }) // Sort by most recent orders first
            .skip(skip)
            .limit(limit);

        res.render("adminOrder", { 
            orders,
            currentPage: page,
            totalPages,
            hasNextPage: page < totalPages,
            hasPrevPage: page > 1,
            nextPage: page + 1,
            prevPage: page - 1,
            lastPage: totalPages
        });
    } catch (error) {
        console.error("Error fetching orders:", error);
        res.status(500).send("Server error")
    }
}


// New controller method to get order details
const getOrderDetails = async (req, res) => {
    try {
        const orderId = req.query.orderId;
        console.log('Requested Order ID:', orderId);

        // Validate orderId
        if (!orderId) {
            return res.status(400).render('error', { 
                message: 'Order ID is required',
                title: 'Error'
            });
        }

        // Find the specific order and populate related fields
        const order = await Order.findById(orderId)
            .populate({
                path: 'userId',
                select: 'name email' // Select specific user fields
            })
            .populate({
                path: 'items.productId',
                select: 'productName productImage' // Select product fields
            });

        // Log the found order for debugging
        console.log('Found Order:', JSON.stringify(order, null, 2));

        if (!order) {
            return res.status(404).render('error', { 
                message: 'Order not found',
                title: 'Order Not Found'
            });
        }

        // Render the view with order details
        res.render('viewOrders', { 
            order: order,
            title: 'Order Details'
        });
    } catch (error) {
        console.error("Error fetching order details:", error);
        res.status(500).render('error', { 
            message: "Server error occurred while fetching order details",
            title: 'Server Error'
        });
    }
}



const updateOrderStatus = async (req, res) => {
    try {
        const { orderId, newStatus } = req.body;

        // Validate input
        if (!orderId || !newStatus) {
            return res.status(400).json({ 
                success: false, 
                message: 'Order ID and new status are required',
                icon: 'warning'
            });
        }

        // Define allowed status progression
        const allowedStatusProgression = {
            'Pending': ['Processing'],
            'Processing': ['Shipped'],
            'Shipped': ['Delivered'],
            'Delivered': [],
            'Cancelled': []
        };

        // Find the current order
        const currentOrder = await Order.findById(orderId);

        // Check if the status change is allowed
        const currentStatus = currentOrder.order_status;
        const allowedNextStatuses = allowedStatusProgression[currentStatus] || [];
        
        if (!allowedNextStatuses.includes(newStatus) && newStatus !== 'Cancelled') {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid status progression',
                icon: 'error'
            });
        }

        // Prepare update object
        const updateData = { order_status: newStatus };

        // If status is Delivered, automatically change payment status to Paid
        if (newStatus === 'Delivered') {
            updateData.payment_status = 'Paid';
        }

        // Find and update the order
        const updatedOrder = await Order.findByIdAndUpdate(
            orderId, 
            updateData, 
            { new: true } // Return the updated document
        );

        if (!updatedOrder) {
            return res.status(404).json({ 
                success: false, 
                message: 'Order not found',
                icon: 'error'
            });
        }

        // Send back a success response
        res.json({ 
            success: true, 
            message: 'Order status updated successfully',
            icon: 'success',
            newStatus: updatedOrder.order_status,
            newPaymentStatus: updatedOrder.payment_status
        });
    } catch (error) {
        console.error("Error updating order status:", error);
        res.status(500).json({ 
            success: false, 
            message: "Server error occurred while updating order status",
            icon: 'error'
        });
    }
}




const cancelOrderItem = async (req, res) => {
    try {
        const { itemId } = req.body;
        
        // Find the order and item first
        const order = await Order.findOne({ "items._id": itemId });
        if (!order) {
            return res.status(404).json({ success: false, message: "Order not found" });
        }

        // Find the specific item
        const item = order.items.find(item => item._id.toString() === itemId);
        if (!item) {
            return res.status(404).json({ success: false, message: "Item not found" });
        }

        // Check if item is already delivered
        if (item.status === 'Delivered') {
            return res.status(400).json({ 
                success: false, 
                message: "Cannot cancel delivered order" 
            });
        }

        // Update product quantity only if item wasn't already cancelled
        if (item.status !== 'Cancelled') {
            await Product.findByIdAndUpdate(
                item.productId,
                { $inc: { quantity: item.quantity } }
            );
        }

        // Calculate new total price
        const cancelledItemTotal = item.total;
        const newTotalPrice = order.totalPrice - cancelledItemTotal;

        // Update the order
        const updatedOrder = await Order.findOneAndUpdate(
            { "items._id": itemId },
            {
                $set: {
                    "items.$.status": "Cancelled",
                    "order_status": "Cancelled",
                    "totalPrice": newTotalPrice
                }
            },
            { new: true }
        );

        res.json({ success: true, order: updatedOrder });
    } catch (error) {
        console.error("Error cancelling order:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
};





const processReturnRequest = async (req, res) => {
    try {
        console.log("Processing return request with data:", req.body);
        const { itemId, action } = req.body;
        
        if (!itemId || !action) {
            return res.status(400).json({ 
                success: false, 
                message: 'Item ID and action are required' 
            });
        }
        
        // Find the order containing the item
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
        
        // Verify the item is in the correct state
        if (item.status !== 'Return Requested') {
            return res.status(400).json({ 
                success: false, 
                message: 'Item is not in return requested state' 
            });
        }
        
        if (action === 'approve') {
            // If approving, we'll use the existing returnOrderItem logic
            // Update item status to Returned
            item.status = 'Returned';
            
            // Find and update product quantity
            const product = await Product.findById(item.productId);
            if (!product) {
                return res.status(404).json({ 
                    success: false, 
                    message: 'Product not found' 
                });
            }
            
            // Calculate refund amount for the item
            const itemTotal = Number((item.quantity * item.price).toFixed(2));
            // Calculate proportional discount for this item
            const itemDiscountPortion = Number((order.discount * (itemTotal / order.totalPrice)).toFixed(2));
            const refundAmount = Number((itemTotal - itemDiscountPortion).toFixed(2));
            
            // Find and update wallet
            const wallet = await Wallet.findOne({ user_id: order.userId });
            if (!wallet && refundAmount > 0) {
                // Create wallet if it doesn't exist
                const newWallet = new Wallet({
                    user_id: order.userId,
                    balance: refundAmount,
                    history: [{
                        amount: refundAmount,
                        transaction_type: 'credit',
                        description: `Refund for returned item from order ${order.orderId}`,
                        transaction_id: `RET-${Date.now()}`
                    }]
                });
                await newWallet.save();
            } else if (wallet && refundAmount > 0) {
                wallet.balance = Number((wallet.balance + refundAmount).toFixed(2));
                wallet.history.push({
                    amount: refundAmount,
                    transaction_type: 'credit',
                    description: `Refund for returned item from order ${order.orderId}`,
                    transaction_id: `RET-${Date.now()}`
                });
                await wallet.save();
            }
            
            // Increment the product quantity
            product.quantity += item.quantity;
            
            // Update product availability status if needed
            if (product.status === 'Out Of Stock' && product.quantity > 0) {
                product.status = 'Available';
            }
            
            // Update order total and discount
            const remainingItems = order.items.filter((item, index) => 
                index !== itemIndex && item.status !== 'Returned');
            const newTotalPrice = Number(remainingItems.reduce((total, item) => 
                total + (item.quantity * item.price), 0).toFixed(2));
            
            // Recalculate discount proportionally for remaining items
            let newDiscount = 0;
            if (order.discount > 0 && newTotalPrice > 0) {
                const discountPercentage = Number((order.discount / order.totalPrice * 100).toFixed(2));
                newDiscount = Number((newTotalPrice * discountPercentage / 100).toFixed(2));
            }
            
            order.totalPrice = Number((newTotalPrice - newDiscount).toFixed(2));
            order.discount = Number(newDiscount.toFixed(2));
            
            // If all items are returned, update order status
            const allItemsReturned = order.items.every(item => 
                item.status === 'Returned' || item.status === 'Cancelled');
            if (allItemsReturned) {
                order.order_status = 'Returned';
                order.totalPrice = 0;
                order.discount = 0;
            } else {
                // Check if any items are still in Return Requested status
                const anyReturnRequested = order.items.some(item => item.status === 'Return Requested');
                if (!anyReturnRequested) {
                    // If no more items are in Return Requested status, update order status
                    if (order.order_status === 'Return Requested') {
                        order.order_status = 'Delivered'; // Revert to original status
                    }
                }
            }
            
            // Save changes
            await Promise.all([
                order.save(),
                product.save()
            ]);
            
            return res.json({ 
                success: true, 
                message: 'Return request approved successfully',
                newStatus: 'Returned'
            });
            
        } else if (action === 'reject') {
            // Update item status to rejected
            item.status = 'Rejected';
            
            // Check if any other items are still in Return Requested status
            const anyReturnRequested = order.items.some((item, idx) => 
                idx !== itemIndex && item.status === 'Return Requested');
                
            // If no more items are in Return Requested status, update order status
            if (!anyReturnRequested && order.order_status === 'Return Requested') {
                order.order_status = 'Delivered'; // Revert to original status
            }
            
            await order.save();
            
            return res.json({ 
                success: true, 
                message: 'Return request rejected',
                newStatus: 'Rejected'
            });
            
        } else {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid action. Must be "approve" or "reject"' 
            });
        }
        
    } catch (error) {
        console.error('Error processing return request:', error);
        console.error('Stack trace:', error.stack);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to process return request',
            error: error.message 
        });
    }
};




module.exports={
    getAdminOrderPage,
    getOrderDetails,
    updateOrderStatus,
    cancelOrderItem,
    processReturnRequest
    
}