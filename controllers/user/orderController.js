const Order = require('../../models/orderSchema');
const User = require("../../models/userScheme");
const Product = require('../../models/productSchema');
const Address = require('../../models/addressSchema');
const Cart = require('../../models/cartSchema');


const getOrderPage = async (req, res) => {
    try {
        const userId = req.session.user;
        
        // Pagination parameters
        const page = parseInt(req.query.page) || 1;
        const limit = 7; // Number of orders per page
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



// const getOrderSummary = async (req, res) => {
//     try {
//         const orderId = req.params.orderId;
        
//         // Find order by the custom orderId
//         const order = await Order.findOne({ orderId: orderId })
//             .populate({
//                 path: 'items.productId',
//                 populate: {
//                     path: 'category',
//                     model: 'Category'
//                 }
//             })
//             .populate('address')
//             .populate('userId');

//         if (!order) {
//             return res.status(404).render('error', { 
//                 message: 'Order not found',
//                 error: 'The requested order could not be found'
//             });
//         }

//         // Calculate subtotals for each item
//         const itemsWithSubtotal = order.items.map(item => ({
//             ...item.toObject(),
//             subtotal: item.quantity * item.price
//         }));

//         res.render('orderSummary', { 
//             order: order,
//             items: itemsWithSubtotal,
//             address: order.address,
//             orderId: order.orderId
//         });
//     } catch (error) {
//         console.error('Error fetching order details:', error);
//         res.status(500).render('error', { 
//             message: 'Error retrieving order details',
//             error: error.message 
//         });
//     }
// };



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

        // Find the order
        const order = await Order.findOne({ orderId: orderId });

        if (!order) {
            return res.status(404).json({ 
                success: false, 
                message: 'Order not found' 
            });
        }

        // Find the index of the item to be removed
        const itemIndex = order.items.findIndex(item => 
            item._id.toString() === itemId
        );

        if (itemIndex === -1) {
            return res.status(404).json({ 
                success: false, 
                message: 'Item not found in the order' 
            });
        }

        // Get the item to be removed
        const removedItem = order.items[itemIndex];

        // Remove the item from the order
        order.items.splice(itemIndex, 1);

        // Recalculate total price
        order.totalPrice -= removedItem.quantity * removedItem.price;

        // Save the updated order
        await order.save();

        // Return the item to stock
        await Product.findByIdAndUpdate(removedItem.productId, {
            $inc: { stock: removedItem.quantity }
        });

        // If no items left, update order status
        if (order.items.length === 0) {
            order.order_status = 'Cancelled';
            await order.save();
        }

        res.json({ 
            success: true, 
            message: 'Item successfully removed from order',
            updatedTotalPrice: order.totalPrice
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

        // Find the order
        const order = await Order.findOne({ orderId: orderId });

        if (!order) {
            return res.status(404).json({ 
                success: false, 
                message: 'Order not found' 
            });
        }

        // Check if order is already cancelled
        if (order.order_status === 'Cancelled') {
            return res.status(400).json({ 
                success: false, 
                message: 'Order is already cancelled' 
            });
        }

        // Update order status to Cancelled
        order.order_status = 'Cancelled';
        order.cancelReason = cancelReason || 'Customer request';

        // Return all items to stock
        for (const item of order.items) {
            await Product.findByIdAndUpdate(item.productId, {
                $inc: { stock: item.quantity }
            });
        }

        // Clear order items
        order.items = [];
        order.totalPrice = 0;

        // Save the updated order
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



module.exports={
    getOrderPage,
    getOrderSummary,
    cancelOrderItem,
    cancelAllOrders

}