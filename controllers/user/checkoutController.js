const Order = require('../../models/orderSchema');
const User = require("../../models/userScheme");
const Product = require('../../models/productSchema');
const Address = require('../../models/addressSchema');
const Cart = require('../../models/cartSchema');
const Offer = require('../../models/offerSchema');
const Coupon = require('../../models/couponSchema');
const Wallet = require('../../models/walletSchema')
const PDFDocument = require('pdfkit');
const Razorpay = require('razorpay');
const crypto = require('crypto');



// Initialize Razorpay
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});





const getCheckoutPage = async (req, res) => {
    try {
        const userId = req.session.user;
        if (!userId) {
            return res.redirect('/login');
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.redirect('/login');
        }

        const addresses = await Address.find({ userId });

        // Get current date as a string in YYYY-MM-DD format
        const currentDate = new Date().toISOString().split('T')[0];
        console.log('Current date for comparison:', currentDate);

        // Fetch active offers
        const activeOffers = await Offer.find({
            status: 'active',
            validTill: { $gt: new Date() }
        });

        const activeCoupons = await Coupon.find({
            is_active: true,
            validFrom: { $lte: currentDate },
            expiryDate: { $gte: currentDate }
        });

        console.log('Active Coupons Found:', activeCoupons);

        // Fetch the cart with populated product details including category
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
            return res.render("checkout", { 
                cartItems: [], 
                subtotal: 0,
                addresses,
                user,
                coupons: activeCoupons
            });
        }
        
      

        // Check if any product is out of stock
        let outOfStockItems = [];
        for (const item of cart.items) {
            if (!item.productId) continue;
            
            // Assuming the product document has a 'quantity' field for stock
            const productStock = item.productId.quantity || 0;
            const cartQuantity = item.quantity;
            
            if (productStock < cartQuantity) {
                outOfStockItems.push({
                    productName: item.productId.productName,
                    requested: cartQuantity,
                    available: productStock
                });
            }
        }
        
        // If any item is out of stock, redirect to cart with error message
        if (outOfStockItems.length > 0) {
            req.session.stockError = {
                message: 'Some items in your cart are out of stock',
                items: outOfStockItems
            };
            return res.redirect('/cart');
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

        // Round the subtotal
        const roundedSubtotal = Math.round(subtotal);

        // Filter coupons based on minimum purchase amount
        const availableCoupons = activeCoupons
            .filter(coupon => roundedSubtotal >= coupon.min_purchase_amount)
            .map(coupon => ({
                ...coupon.toObject(),
                isUsed: coupon.used_users.includes(userId)
            }));

        console.log('Available Coupons after subtotal filter:', availableCoupons);

        res.render("checkout", { 
            addresses,
            user,
            cartItems,
            subtotal: roundedSubtotal || 0,
            coupons: availableCoupons
        });

    } catch (error) {
        console.error("Checkout page error:", error);
        res.status(500).render('error', { 
            message: 'Error loading checkout page',
            error: error.message
        });
    }
};


const showOrderConfirmation = async (req, res) => {
    try {
        const orderId = req.params.orderId;
        const order = await Order.findOne({ orderId: orderId });
        
        if (!order) {
            return res.status(404).render('error', {
                message: 'Order not found',
                error: 'The requested order could not be found'
            });
        }

        res.render('orderConfirmation', {
            orderId: order.orderId,
            payment_status: order.payment_status,
            paymentMethod: order.paymentMethod,
            razorpay_key_id: process.env.RAZORPAY_KEY_ID,
            razorpay_order_id: order.razorpay_order_id,
            amount: Math.round(order.totalPrice * 100) // Amount in paise
        });
    } catch (error) {
        console.error('Order Confirmation Error:', error);
        res.status(500).render('error', {
            message: 'Error showing order confirmation',
            error: error.message
        });
    }
};


const placeOrder = async (req, res) => {
    try {
        const userId = req.session.user;
        const { selectedAddressId, paymentMethod, appliedCoupon } = req.body;

        if (!userId || !selectedAddressId || !paymentMethod) {
            return res.status(400).render('error', { 
                message: 'Missing Required Fields',
                error: 'Please ensure all required fields are filled'
            });
        }

        // Get user address
        const address = await Address.findById(selectedAddressId);
        if (!address) {
            return res.status(400).render('error', { 
                message: 'Invalid Address',
                error: 'Selected address is invalid'
            });
        }

        // Parse coupon data first - this is crucial for both payment methods
        let couponData = null;
        let totalCouponDiscount = 0;
        if (appliedCoupon) {
            try {
                couponData = typeof appliedCoupon === 'string' ? 
                    JSON.parse(appliedCoupon) : appliedCoupon;
                totalCouponDiscount = Number(couponData.discountAmount) || 0;
            } catch (error) {
                console.error('Error parsing coupon data:', error);
            }
        }

        // Get current date and active offers
        const currentDate = new Date();
        const activeOffers = await Offer.find({
            status: 'active',
            validTill: { $gt: currentDate }
        });

        // Get user's cart with populated product details
        const cart = await Cart.findOne({ userId })
            .populate({
                path: 'items.productId',
                populate: {
                    path: 'category',
                    select: '_id'
                },
                select: 'productName regularPrice quantity category'
            });

        if (!cart || cart.items.length === 0) {
            return res.status(400).render('error', { 
                message: 'Empty Cart',
                error: 'Your cart is empty'
            });
        }

        // Initialize order items array and total price
        const orderItems = [];
        let totalPrice = 0;
        let originalTotalPrice = 0;

        // Process each cart item
        for (let item of cart.items) {
            const product = await Product.findById(item.productId._id);
            if (!product || product.quantity < item.quantity) {
                return res.status(400).render('error', { 
                    message: product ? 'Insufficient Stock' : 'Product Not Found',
                    error: product ? 
                        `Insufficient stock for product: ${product.productName}` : 
                        `Product not found: ${item.productId._id}`
                });
            }

            // Calculate best available offer discount
            let bestDiscount = 0;

            // Check category offers
            const categoryOffers = activeOffers.filter(offer => 
                offer.type === 'category' && 
                offer.category.some(cat => cat.toString() === item.productId.category._id.toString())
            );
            if (categoryOffers.length > 0) {
                bestDiscount = Math.max(...categoryOffers.map(o => Number(o.discount) || 0));
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

            // Calculate price after offers
            const priceAfterOffers = bestDiscount > 0 
                ? Math.round(product.regularPrice - (product.regularPrice * (bestDiscount/100)))
                : product.regularPrice;

            originalTotalPrice += priceAfterOffers * item.quantity;

            // Calculate final price with coupon
            let finalPrice = priceAfterOffers;
            if (couponData && couponData.itemDiscounts) {
                const itemDiscount = couponData.itemDiscounts.find(
                    discount => discount.productId === item.productId._id.toString()
                );
                if (itemDiscount) {
                    finalPrice = Number(itemDiscount.finalPrice);
                }
            }

            // Add item to order
            const orderItem = {
                productId: item.productId._id,
                name: product.productName,
                quantity: item.quantity,
                price: priceAfterOffers,
                couponDiscount: finalPrice, // Store the discounted price
                productOffer: bestDiscount,
                status: 'Pending',
                total: finalPrice * item.quantity
            };

            orderItems.push(orderItem);
            totalPrice += finalPrice * item.quantity;

            // Update product quantity
            product.quantity -= item.quantity;
            await product.save();
        }

        

        // Generate unique order ID
        const orderId = `ORD-${Date.now().toString()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;

        // Create base order object
        const orderData = {
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
            totalPrice: totalPrice.toFixed(2),
            discount: (originalTotalPrice - totalPrice).toFixed(2),
            paymentMethod,
            orderId: orderId,
            payment_status: paymentMethod === 'Razorpay' ? 'Processing' : 'Pending',
            order_status: 'Pending',
            deliveryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        };

        // Create and save order
        const savedOrder = await new Order(orderData).save();

        // Clear cart
        await Cart.findOneAndUpdate({ userId }, { $set: { items: [] } });

        // Handle Razorpay payment
        if (paymentMethod === 'Razorpay') {
            const razorpayOrder = await razorpay.orders.create({
                amount: Math.round(totalPrice * 100),
                currency: "INR",
                receipt: orderId
            });

            await Order.findByIdAndUpdate(savedOrder._id, {
                razorpay_order_id: razorpayOrder.id
            });

            return res.json({
                success: true,
                orderId: razorpayOrder.id,
                bookverseOrderId: orderId,
                amount: razorpayOrder.amount,
                key_id: process.env.RAZORPAY_KEY_ID,
                prefill: {
                    name: address.addressName,
                    email: req.session.email,
                    contact: address.addressMobile
                }
            });
        }

        // Redirect for COD
        res.redirect(`/orderConfirmation/${orderId}`);

    } catch (error) {
        console.error('Place Order Error:', error);
        res.status(500).render('error', {
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



const generateInvoicePDF = async (req, res) => {
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

        // Create a new PDF document
        const doc = new PDFDocument({ 
            margin: 50, 
            size: 'A4',
            info: {
                Title: `Invoice ${orderId}`,
                Author: 'Your Company Name'
            }
        });
        
        // Set response headers
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=invoice-${orderId}.pdf`);
        
        // Pipe the PDF document to the response
        doc.pipe(res);
        
        // Define document dimensions
        const pageWidth = doc.page.width;
        const contentWidth = pageWidth - 100; // 50px margin on each side
        
        // Define colors
        const colors = {
            primary: '#3366cc',
            secondary: '#f5f5f5',
            accent: '#e6e6e6',
            text: '#333333',
            lightText: '#666666'
        };
        
        // Document title - centered
        doc.rect(0, 0, pageWidth, 100)
           .fill(colors.primary);
        
        doc.fillColor('white')
           .fontSize(28)
           .font('Helvetica-Bold')
           .text('INVOICE', 0, 40, { align: 'center' });
        
        // Company info
        doc.fontSize(10)
           .font('Helvetica')
           .text('BOOKVERSE', 0, 75, { align: 'center' });
        
        // Invoice details - clearly separated and centered
        const detailsY = 120;
        
        // Invoice number
        doc.fillColor(colors.text)
           .fontSize(14)
           .font('Helvetica-Bold')
           .text('INVOICE', 0, detailsY, { align: 'center' });
        
        doc.fontSize(14)
           .font('Helvetica')
           .text(orderId, 0, detailsY + 20, { align: 'center' });
        
        // Date
        doc.fontSize(12)
           .font('Helvetica-Bold')
           .text('Date:', 0, detailsY + 50, { align: 'center' });
        
        doc.fontSize(12)
           .font('Helvetica')
           .text(order.createdAt.toLocaleDateString(), 0, detailsY + 70, { align: 'center' });
        
        // Horizontal line
        doc.strokeColor(colors.accent)
           .lineWidth(1)
           .moveTo(50, detailsY + 100)
           .lineTo(pageWidth - 50, detailsY + 100)
           .stroke();
        
        // Customer and order information boxes
        const infoStartY = detailsY + 120;
        const infoBoxHeight = 130;
        const infoBoxWidth = contentWidth / 2 - 10;
        
        // Customer info box
        doc.rect(50, infoStartY, infoBoxWidth, infoBoxHeight)
           .fillAndStroke(colors.secondary, colors.accent);
        
        doc.fillColor(colors.text)
           .fontSize(14)
           .font('Helvetica-Bold')
           .text('BILL TO', 50 + 15, infoStartY + 15);
        
        doc.fontSize(11)
           .font('Helvetica')
           .text(order.addresses.addressName, 50 + 15, infoStartY + 40)
           .text(order.addresses.addressHouse, 50 + 15, infoStartY + 55)
           .text(`${order.addresses.addressPost}, ${order.addresses.addressDistrict}`, 50 + 15, infoStartY + 70)
           .text(`${order.addresses.addressState} - ${order.addresses.addressPin}`, 50 + 15, infoStartY + 85)
           .text(`Phone: ${order.addresses.addressMobile}`, 50 + 15, infoStartY + 100);
        
        // Order info box
        const orderInfoX = 50 + infoBoxWidth + 20;
        
        doc.rect(orderInfoX, infoStartY, infoBoxWidth, infoBoxHeight)
           .fillAndStroke(colors.secondary, colors.accent);
        
        doc.fillColor(colors.text)
           .fontSize(14)
           .font('Helvetica-Bold')
           .text('ORDER DETAILS', orderInfoX + 15, infoStartY + 15);
        
        doc.fontSize(11)
           .font('Helvetica')
           .text(`Order ID: #${order.orderId}`, orderInfoX + 15, infoStartY + 40)
           .text(`Order Date: ${order.createdAt.toLocaleDateString()}`, orderInfoX + 15, infoStartY + 55)
           .text(`Payment Method: ${order.paymentMethod}`, orderInfoX + 15, infoStartY + 70);
        
        // Add status badge
        const statusColors = {
            'Delivered': '#28a745',
            'Processing': '#ffc107',
            'Cancelled': '#dc3545',
            'default': '#6c757d'
        };
        
        const statusColor = statusColors[order.order_status] || statusColors.default;
        
        doc.roundedRect(orderInfoX + 15, infoStartY + 95, 120, 25, 5)
           .fill(statusColor);
        
        doc.fillColor('white')
           .fontSize(11)
           .font('Helvetica-Bold')
           .text(order.order_status, orderInfoX + 15, infoStartY + 101, { width: 120, align: 'center' });
        
        // Product table
        const tableTop = infoStartY + infoBoxHeight + 40;
        const tableWidth = contentWidth;
        
        // Column widths - sum should equal tableWidth
        const colWidths = [
            tableWidth * 0.08,  // SI No.
            tableWidth * 0.35,  // Product Name
            tableWidth * 0.18,  // Category
            tableWidth * 0.12,  // Quantity
            tableWidth * 0.12,  // Price
            tableWidth * 0.15   // Total
        ];
        
        // Table headers
        doc.rect(50, tableTop, tableWidth, 30)
           .fill(colors.primary);
        
        // Header text
        doc.fillColor('white')
           .fontSize(12)
           .font('Helvetica-Bold');
        
        const headers = ['SI No.', 'Product Name', 'Category', 'Quantity', 'Price', 'Total'];
        let currentX = 50;
        
        headers.forEach((header, i) => {
            const align = i > 2 ? 'right' : 'left';
            const paddingX = i > 2 ? colWidths[i] - 10 : 10;
            
            doc.text(header, 
                   i > 2 ? currentX : currentX + 10, 
                   tableTop + 10, 
                   { width: colWidths[i], align: align });
            
            currentX += colWidths[i];
        });
        
        // Table rows
        let rowY = tableTop + 30;
        
        // Calculate subtotal for each item
        const itemsWithSubtotal = order.items.map((item, index) => {
            const subtotal = item.price * item.quantity;
            return {
                ...item.toObject(),
                subtotal
            };
        });
        
        // Create table rows with alternating colors
        let alternateRow = false;
        itemsWithSubtotal.forEach((item, index) => {
            const rowHeight = 30;
            
            // Row background
            if (alternateRow) {
                doc.rect(50, rowY, tableWidth, rowHeight)
                   .fill(colors.secondary);
            }
            alternateRow = !alternateRow;
            
            // Row text
            doc.fillColor(colors.text)
               .fontSize(10)
               .font('Helvetica');
            
            currentX = 50;
            
            // Row content
            const rowContent = [
                index + 1,
                item.productId.productName,
                item.productId.category.name,
                item.quantity,
                `₹${item.price.toFixed(2)}`,
                `₹${item.subtotal.toFixed(2)}`
            ];
            
            rowContent.forEach((content, i) => {
                const align = i > 2 ? 'right' : 'left';
                const paddingX = i > 2 ? colWidths[i] - 10 : 10;
                
                doc.text(content.toString(), 
                       i > 2 ? currentX : currentX + 10, 
                       rowY + 10, 
                       { width: colWidths[i], align: align });
                
                currentX += colWidths[i];
            });
            
            rowY += rowHeight;
        });
        
        // Calculate totals
        const subtotalAmount = itemsWithSubtotal.reduce((sum, item) => sum + item.subtotal, 0);
        const discountAmount = subtotalAmount - order.totalPrice;
        
        // Summary section - right aligned, clearly visible
        const summaryX = 50 + tableWidth - 250; // Increased from 200 to 250
        const summaryWidth = 250; // Increased from 200 to 250
        rowY += 20; // Add space after the table
        
        // Draw summary box
        const summaryHeight = discountAmount > 0 ? 100 : 70;
        doc.rect(summaryX, rowY, summaryWidth, summaryHeight)
           .fill(colors.secondary);
        
        // Subtotal
        let summaryY = rowY + 15;
        
        doc.fillColor(colors.text)
           .fontSize(11)
           .font('Helvetica-Bold')
           .text('Subtotal:', summaryX + 20, summaryY);
        
        doc.fontSize(11)
           .font('Helvetica')
           .text(`₹${subtotalAmount.toFixed(2)}`, summaryX + summaryWidth - 80, summaryY, { align: 'right' }); // Increased padding from 60 to 80
        
        summaryY += 20;
        
        // Discount if applicable
        if (discountAmount > 0) {
            doc.fillColor(colors.text)
               .fontSize(11)
               .font('Helvetica-Bold')
               .text('Discount:', summaryX + 20, summaryY);
            
            doc.fillColor('#dc3545')
               .fontSize(11)
               .font('Helvetica')
               .text(`-₹${discountAmount.toFixed(2)}`, summaryX + summaryWidth - 80, summaryY, { align: 'right' }); // Increased padding from 60 to 80
            
            summaryY += 20;
        }
        
        // Add separator line
        doc.strokeColor(colors.accent)
           .lineWidth(1)
           .moveTo(summaryX + 20, summaryY)
           .lineTo(summaryX + summaryWidth - 20, summaryY)
           .stroke();
        
        summaryY += 15;
        
        // Total - made very prominent
        doc.fillColor(colors.primary)
           .fontSize(14)
           .font('Helvetica-Bold')
           .text('TOTAL:', summaryX + 20, summaryY);
        
        doc.fontSize(14)
           .font('Helvetica-Bold')
           .text(`₹${order.totalPrice.toFixed(2)}`, summaryX + summaryWidth - 80, summaryY, { align: 'right' }); // Increased padding from 60 to 80
        
        // Add footer
        const footerY = doc.page.height - 50;
        
        doc.rect(0, footerY - 10, pageWidth, 60)
           .fill(colors.primary);
        
        doc.fillColor('white')
           .fontSize(12)
           .font('Helvetica-Bold')
           .text('Thank you for your business!', 0, footerY + 5, { align: 'center' })
           .fontSize(10)
           .font('Helvetica')
           .text('For any questions regarding this invoice, please contact support@yourcompany.com', 0, footerY + 25, { align: 'center' });
        
        // Finalize the PDF
        doc.end();
        
    } catch (error) {
        console.error('Error generating invoice PDF:', error);
        res.status(500).render('error', { 
            message: 'Error generating invoice PDF',
            error: error.message 
        });
    }
};





const applyCoupon = async (req, res) => {
    try {
        const userId = req.session.user;
        const { couponCode, subtotal } = req.body;

        // Find the coupon
        const coupon = await Coupon.findOne({
            couponId: couponCode,
            is_active: true,
            validFrom: { $lte: new Date().toISOString().split('T')[0] },
            expiryDate: { $gte: new Date().toISOString().split('T')[0] }
        });

        if (!coupon) {
            return res.json({
                success: false,
                message: 'Invalid or expired coupon code'
            });
        }

        // Validation checks
        if (coupon.used_users.includes(userId)) {
            return res.json({
                success: false,
                message: 'You have already used this coupon'
            });
        }

        // Get cart items with populated product details and category
        const cart = await Cart.findOne({ userId })
            .populate({
                path: 'items.productId',
                populate: {
                    path: 'category',
                    select: '_id'
                }
            });

        if (!cart) {
            return res.json({
                success: false,
                message: 'Cart not found'
            });
        }

        // Get active offers
        const currentDate = new Date();
        const activeOffers = await Offer.find({
            status: 'active',
            validTill: { $gt: currentDate }
        });

        // Calculate subtotal and prepare items with correct prices
        let subtotalWithOffers = 0;
        const itemsWithPrices = cart.items.map(item => {
            const product = item.productId;
            let bestDiscount = 0;
            let finalPrice = product.regularPrice;

            // Check category offers
            const categoryOffers = activeOffers.filter(offer => 
                offer.type === 'category' && 
                offer.category.some(cat => cat.toString() === product.category._id.toString())
            );
            if (categoryOffers.length > 0) {
                bestDiscount = Math.max(...categoryOffers.map(o => o.discount));
            }

            // Check product offers
            const productOffers = activeOffers.filter(offer => 
                offer.type === 'product' && 
                offer.products.some(p => p.toString() === product._id.toString())
            );
            if (productOffers.length > 0) {
                const maxProductDiscount = Math.max(...productOffers.map(o => o.discount));
                bestDiscount = Math.max(bestDiscount, maxProductDiscount);
            }

            // Apply offer discount if exists
            if (bestDiscount > 0) {
                finalPrice = product.regularPrice - (product.regularPrice * (bestDiscount/100));
            }

            const itemSubtotal = finalPrice * item.quantity;
            subtotalWithOffers += itemSubtotal;

            return {
                ...item.toObject(),
                finalPrice,
                itemSubtotal
            };
        });

        if (subtotalWithOffers < coupon.min_purchase_amount) {
            return res.json({
                success: false,
                message: `Minimum purchase amount of ₹${coupon.min_purchase_amount} required`
            });
        }

        // Calculate percentage-based discount on the offer-adjusted subtotal
        const percentageDiscount = (subtotalWithOffers * coupon.discount) / 100;
        const totalDiscountToApply = Math.round(Math.min(percentageDiscount, coupon.max_amount));

        // Calculate proportional discounts for each item based on their offer-adjusted prices
        let remainingDiscount = totalDiscountToApply;
        const itemDiscounts = [];
        
        // First pass - calculate rounded discounts for all items except the last one
        for (let i = 0; i < itemsWithPrices.length - 1; i++) {
            const item = itemsWithPrices[i];
            const proportion = item.itemSubtotal / subtotalWithOffers;
            const rawItemDiscountAmount = totalDiscountToApply * proportion;
            const itemDiscountAmount = Math.round(rawItemDiscountAmount);
            const discountPerUnit = Math.round(itemDiscountAmount / item.quantity);
            
            remainingDiscount -= itemDiscountAmount;
            
            itemDiscounts.push({
                productId: item.productId._id,
                productName: item.productId.productName,
                quantity: item.quantity,
                originalPrice: item.finalPrice,  // This is already the offer-adjusted price
                discountAmount: itemDiscountAmount,
                discountPerUnit: discountPerUnit,
                finalPrice: item.finalPrice - discountPerUnit
            });
        }
        
        // Last item gets the remaining discount to ensure total adds up exactly
        if (itemsWithPrices.length > 0) {
            const lastItem = itemsWithPrices[itemsWithPrices.length - 1];
            const lastItemDiscountPerUnit = Math.round(remainingDiscount / lastItem.quantity);
            
            itemDiscounts.push({
                productId: lastItem.productId._id,
                productName: lastItem.productId.productName,
                quantity: lastItem.quantity,
                originalPrice: lastItem.finalPrice,
                discountAmount: remainingDiscount,
                discountPerUnit: lastItemDiscountPerUnit,
                finalPrice: lastItem.finalPrice - lastItemDiscountPerUnit
            });
        }

        const finalAmount = Math.round(subtotalWithOffers - totalDiscountToApply);

        // Determine discount type and message
        const isMaxDiscountApplied = totalDiscountToApply === Math.round(coupon.max_amount);
        const discountMessage = isMaxDiscountApplied
            ? `Maximum discount of ₹${Math.round(coupon.max_amount)} applied`
            : `${coupon.discount}% discount applied`;

        res.json({
            success: true,
            discountAmount: totalDiscountToApply,
            finalAmount,
            itemDiscounts,
            discountType: isMaxDiscountApplied ? 'max' : 'percentage',
            discountValue: isMaxDiscountApplied ? Math.round(coupon.max_amount) : coupon.discount,
            message: discountMessage
        });

    } catch (error) {
        console.error('Coupon application error:', error);
        res.status(500).json({
            success: false,
            message: 'Error applying coupon'
        });
    }
};





const createRazorpayOrder = async (req, res) => {
    try {
        const userId = req.session.user;
        const { selectedAddressId, paymentMethod, appliedCoupon } = req.body;

        // Validate inputs
        const cart = await Cart.findOne({ userId })
            .populate({
                path: 'items.productId',
                populate: {
                    path: 'category',
                    select: '_id'
                }
            });
        const address = await Address.findById(selectedAddressId);
        const user = await User.findById(userId);

        if (!cart || !cart.items.length) {
            return res.status(400).json({ success: false, message: 'Cart is empty' });
        }

        // Get current date and active offers
        const currentDate = new Date();
        const activeOffers = await Offer.find({
            status: 'active',
            validTill: { $gt: currentDate }
        });

        // Calculate total amount including offers
        let totalAmount = 0;
        const orderItems = [];

        for (const item of cart.items) {
            const product = item.productId;
            let bestDiscount = 0;

            // Check category offers
            const categoryOffers = activeOffers.filter(offer => 
                offer.type === 'category' && 
                offer.category.some(cat => cat.toString() === product.category._id.toString())
            );

            if (categoryOffers.length > 0) {
                bestDiscount = Math.max(...categoryOffers.map(o => Number(o.discount) || 0));
            }

            // Check product-specific offers
            const productOffers = activeOffers.filter(offer => 
                offer.type === 'product' && 
                offer.products.some(p => p.toString() === product._id.toString())
            );

            if (productOffers.length > 0) {
                const maxProductDiscount = Math.max(...productOffers.map(o => Number(o.discount) || 0));
                bestDiscount = Math.max(bestDiscount, maxProductDiscount);
            }

            // Calculate final price with offer discount
            const finalPrice = bestDiscount > 0 
                ? Math.round(product.regularPrice - (product.regularPrice * (bestDiscount/100)))
                : product.regularPrice;

            let itemTotal = finalPrice * item.quantity;
            let couponDiscount = 0;

            // Apply coupon discount if present
            if (appliedCoupon) {
                const couponData = JSON.parse(appliedCoupon);
                const itemDiscount = couponData.itemDiscounts.find(
                    discount => discount.productId === product._id.toString()
                );
                if (itemDiscount) {
                    couponDiscount = itemDiscount.discountPerUnit;
                    itemTotal = itemDiscount.finalPrice * item.quantity;
                }
            }

            totalAmount += itemTotal;

            orderItems.push({
                productId: product._id,
                name: product.productName,
                quantity: item.quantity,
                price: finalPrice,
                couponDiscount: couponDiscount, // Store the coupon discount per unit
                total: itemTotal,
                productOffer: bestDiscount,
                status: 'Pending'
            });
        }

        // Round the final amount to ensure consistency
        totalAmount = Math.round(totalAmount);

        // Create Razorpay order with the exact final amount
        const razorpayOrder = await razorpay.orders.create({
            amount: totalAmount * 100, // Convert to paise
            currency: 'INR',
            receipt: 'order_' + Date.now()
        });

        // Generate order ID
        const orderId = 'ORD-' + Date.now() + '-' + Math.random().toString(36).substring(7);

        // Calculate total coupon discount if applied
        let totalCouponDiscount = 0;
        if (appliedCoupon) {
            const couponData = JSON.parse(appliedCoupon);
            totalCouponDiscount = parseFloat(couponData.discountAmount) || 0;
        }

        // Create pending order in database
        const bookverseOrder = await new Order({
            userId,
            addresses: {
                userId: address.userId,
                addressName: address.addressName,
                addressMobile: address.addressMobile,
                addressHouse: address.addressHouse,
                addressPost: address.addressPost,
                addressDistrict: address.addressDistrict,
                addressState: address.addressState,
                addressPin: address.addressPin
            },
            items: orderItems,
            totalPrice: totalAmount,
            discount: totalCouponDiscount, // Store the total coupon discount
            paymentMethod: 'Razor Pay',
            orderId: orderId,
            razorpay_order_id: razorpayOrder.id,
            payment_status: 'Pending',
            order_status: 'Pending',
            deliveryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        }).save();

        // Clear the cart after creating the order
        await Cart.findOneAndUpdate(
            { userId: userId },
            { $set: { items: [] } }
        );

        res.json({
            success: true,
            key_id: process.env.RAZORPAY_KEY_ID,
            amount: razorpayOrder.amount,
            orderId: razorpayOrder.id,
            bookverseOrderId: bookverseOrder.orderId,
            customerName: user.name || address.addressName,
            email: user.email,
            phone: address.addressMobile
        });

    } catch (error) {
        console.error('Razorpay order creation error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create payment order'
        });
    }
};





const verifyPayment = async (req, res) => {
    try {
        const {
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
            orderId
        } = req.body;

        // Verify signature
        const body = razorpay_order_id + "|" + razorpay_payment_id;
        const expectedSignature = crypto
            .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
            .update(body.toString())
            .digest("hex");

        if (expectedSignature === razorpay_signature) {
            // Find the order
            const order = await Order.findOne({ orderId: orderId });
            
            if (order) {
                // Update order status to paid
                await Order.findOneAndUpdate(
                    { orderId: orderId },
                    {
                        $set: {
                            payment_status: 'Paid',
                            razorpay_payment_id,
                            razorpay_signature
                        }
                    }
                );
                
                // Update product quantity for each item in the order
                if (order.items && order.items.length > 0) {
                    for (const item of order.items) {
                        // Use quantity field instead of stock
                        await Product.findByIdAndUpdate(
                            item.productId,
                            { $inc: { quantity: -item.quantity } }
                        );
                    }
                }
            }

            res.json({
                success: true,
                message: 'Payment verified successfully'
            });
        } else {
            // Keep status as Pending to allow retry
            res.json({
                success: false,
                message: 'Payment verification failed'
            });
        }
    } catch (error) {
        console.error('Payment verification error:', error);
        res.status(500).json({
            success: false,
            message: 'Payment verification failed'
        });
    }
};



const checkWalletBalance = async (req, res) => {
    try {
        const userId = req.session.user;
        const wallet = await Wallet.findOne({ user_id: userId });
        res.json({ 
            success: true, 
            balance: wallet ? wallet.balance : 0 
        });
    } catch (error) {
        console.error('Error checking wallet balance:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error checking wallet balance' 
        });
    }
};

const processWalletPayment = async (req, res) => {
    try {
        const userId = req.session.user;
        const { selectedAddressId, paymentMethod, appliedCoupon } = req.body;

        if (!userId || !selectedAddressId) {
            return res.status(400).json({ 
                success: false,
                message: 'Missing required fields'
            });
        }

        // Get wallet
        const wallet = await Wallet.findOne({ user_id: userId });
        if (!wallet) {
            return res.json({ 
                success: false, 
                message: 'Wallet not found' 
            });
        }

        // Get user address
        const address = await Address.findById(selectedAddressId);
        if (!address) {
            return res.status(400).json({ 
                success: false,
                message: 'Invalid address'
            });
        }

        // Parse coupon data
        let couponData = null;
        let totalCouponDiscount = 0;
        if (appliedCoupon) {
            try {
                couponData = typeof appliedCoupon === 'string' ? 
                    JSON.parse(appliedCoupon) : appliedCoupon;
                totalCouponDiscount = Number(couponData.discountAmount) || 0;
            } catch (error) {
                console.error('Error parsing coupon data:', error);
            }
        }

        // Get current date and active offers
        const currentDate = new Date();
        const activeOffers = await Offer.find({
            status: 'active',
            validTill: { $gt: currentDate }
        });

        // Get user's cart with populated product details
        const cart = await Cart.findOne({ userId })
            .populate({
                path: 'items.productId',
                populate: {
                    path: 'category',
                    select: '_id'
                },
                select: 'productName regularPrice quantity category'
            });

        if (!cart || cart.items.length === 0) {
            return res.status(400).json({ 
                success: false,
                message: 'Cart is empty'
            });
        }

        // Initialize order items array and total price
        const orderItems = [];
        let totalPrice = 0;
        let originalTotalPrice = 0;

        // Process each cart item
        for (let item of cart.items) {
            const product = await Product.findById(item.productId._id);
            if (!product || product.quantity < item.quantity) {
                return res.status(400).json({ 
                    success: false,
                    message: product ? 
                        `Insufficient stock for product: ${product.productName}` : 
                        `Product not found: ${item.productId._id}`
                });
            }

            // Calculate best available offer discount
            let bestDiscount = 0;

            // Check category offers
            const categoryOffers = activeOffers.filter(offer => 
                offer.type === 'category' && 
                offer.category.some(cat => cat.toString() === item.productId.category._id.toString())
            );
            if (categoryOffers.length > 0) {
                bestDiscount = Math.max(...categoryOffers.map(o => Number(o.discount) || 0));
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

            // Calculate price after offers
            const priceAfterOffers = bestDiscount > 0 
                ? Math.round(product.regularPrice - (product.regularPrice * (bestDiscount/100)))
                : product.regularPrice;

            originalTotalPrice += priceAfterOffers * item.quantity;

            // Calculate final price with coupon
            let finalPrice = priceAfterOffers;
            if (couponData && couponData.itemDiscounts) {
                const itemDiscount = couponData.itemDiscounts.find(
                    discount => discount.productId === item.productId._id.toString()
                );
                if (itemDiscount) {
                    finalPrice = Number(itemDiscount.finalPrice);
                }
            }

            // Add item to order
            const orderItem = {
                productId: item.productId._id,
                name: product.productName,
                quantity: item.quantity,
                price: priceAfterOffers,
                couponDiscount: finalPrice,
                productOffer: bestDiscount,
                status: 'Pending',
                total: finalPrice * item.quantity
            };

            orderItems.push(orderItem);
            totalPrice += finalPrice * item.quantity;

            // Update product quantity
            product.quantity -= item.quantity;
            await product.save();
        }

        // Check if wallet has sufficient balance
        if (wallet.balance < totalPrice) {
            return res.json({ 
                success: false, 
                message: 'Insufficient wallet balance' 
            });
        }

        // Generate order ID and transaction ID
        const orderId = `ORD-${Date.now().toString()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;
        const transactionId = `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;

        // Deduct amount from wallet
        wallet.balance -= totalPrice;
        wallet.history.push({
            amount: totalPrice,
            transaction_type: 'debit',
            description: `Payment for order ${orderId}`,
            transaction_id: transactionId,
            date: new Date()
        });
        await wallet.save();

        // Create order
        const orderData = {
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
            totalPrice: totalPrice.toFixed(2),
            discount: (originalTotalPrice - totalPrice).toFixed(2),
            paymentMethod: 'Wallet',
            orderId: orderId,
            payment_status: 'Paid',
            order_status: 'Pending',
            deliveryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        };

        // Save order
        const savedOrder = await new Order(orderData).save();

        // Clear cart
        await Cart.findOneAndUpdate(
            { userId: userId },
            { $set: { items: [] } }
        );

        res.json({
            success: true,
            orderId: savedOrder.orderId,
            message: 'Payment successful'
        });

    } catch (error) {
        console.error('Wallet payment error:', error);
        res.status(500).json({
            success: false,
            message: 'Payment failed'
        });
    }
};



module.exports={
    getCheckoutPage,
    // addnewAddress,
    // editAddress,
    showOrderConfirmation ,
    placeOrder,
    getOrderDetails ,
    generateInvoicePDF,
    applyCoupon,
    createRazorpayOrder,
    verifyPayment,
    checkWalletBalance,
    processWalletPayment  

}