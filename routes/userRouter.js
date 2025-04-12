const express=require("express");
const router=express.Router();
const config=require("../config/config")
const session=require("express-session");
const nocache = require('nocache');
const passport=require("passport");
const userController=require("../controllers/user/userController");
const cartController=require("../controllers/user/cartController");
const profileController=require("../controllers/user/profileController");
const addressController=require("../controllers/user/addressController");
const checkoutController=require("../controllers/user/checkoutController");
const orderController=require("../controllers/user/orderController");
const wishlistController=require("../controllers/user/wishlistController");
const walletController = require('../controllers/user/walletController')
const {userAuth,userAuthOut}=require("../middleware/auth")


router.use(session({
    secret:process.env.SESSION_SECRET,
    resave:false,
    saveUninitialized:false,
    cookie:{
      path:'/',
      httpOnly:true
    }
  }));

router.use(nocache());

router.get("/pageNotFound",userController.pageNotFound)
router.get("/",userController.loadHomepage);
router.get('/login',userAuthOut,userController.loadLogin)

router.get("/register",userAuthOut,userController.loadRegister)

router.post("/signup",userAuthOut,userController.signup)
router.get("/verify-otp",userAuthOut,userController.getOtpPage)
router.post("/verify-otp",userAuthOut,userController.verifyOtp)
router.post("/resend-otp",userAuthOut,userController.resendOtp)

// router.get('/auth/google',userAuthOut,passport.authenticate('google',{scope:['profile','email']}));

// router.get('/auth/google/callback',userAuthOut,passport.authenticate('google',{failureRedirect:'/signin'}),(req,res)=>{
//     res.redirect("/")
// })


// In your routes/userRouter.js
router.get('/auth/google', 
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

router.get('/auth/google/callback',
  userAuthOut, // Your middleware to prevent logged-in users from accessing login page
  passport.authenticate('google', { failureRedirect: '/login' }),
  (req, res) => {
    // Set session.user to match your regular login flow
    req.session.user = req.user._id;
    res.redirect('/');
  }
);


// In your routes/userRouter.js file
router.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/login' }),
  (req, res) => {
    // This is crucial: manually set req.session.user to match your custom auth
    req.session.user = req.user._id;
    res.redirect('/');
  }
);

router.post("/login_user",userAuthOut,userController.login)

router.get("/logout",userController.logout)


router.get("/shop",userController.getShopPage)

router.get("/productDetails/:productId", userController.getProductDetails)

// to show related product details
router.get("/product/:productId", userController.getProductDetails);


//Forgot Password
router.get("/forgotPassword", userAuthOut, userController.forgotPasswordPage);
router.post("/forgotPassword", userAuthOut, userController.forgotPassword);
router.post("/verifyResetOtp", userAuthOut, userController.verifyResetOtp);
router.post("/resetPassword", userAuthOut, userController.resetPassword);
router.post("/resendResetOtp", userAuthOut, userController.resendResetOtp);


//Cart Management

router.get("/cart", userAuth, cartController.getCartPage);
router.post('/cart/add', userAuth, cartController.addToCart);
router.post('/cart/update', userAuth, cartController.updateCartItem);
router.post('/cart/remove', userAuth, cartController.removeCartItem);


//Profile Management
router.get("/profile", userAuth, profileController.getProfilePage);
router.post("/profile/update", userAuth, profileController.updateProfile);
router.post("/change-password", userAuth, profileController.changePassword);


//Address management
router.get("/address",userAuth, addressController.getAddressPage);
router.post("/api/address",userAuth, addressController.addAddress);
router.post("/api/address/update",userAuth, addressController.updateAddress);
router.delete("/api/address/:addressId",userAuth, addressController.deleteAddress);


// CheckOut Management
router.get("/checkout", userAuth, checkoutController.getCheckoutPage);
router.post('/placeorder', userAuth,checkoutController.placeOrder);
router.get('/orderDetails/:orderId', userAuth, checkoutController.getOrderDetails);
router.get('/order/:orderId/invoice',userAuth, checkoutController.generateInvoicePDF);
router.post('/apply-coupon', userAuth, checkoutController.applyCoupon);
router.post('/create-razorpay-order', userAuth, checkoutController.createRazorpayOrder);
router.post('/verify-payment', userAuth, checkoutController.verifyPayment);
router.get('/orderConfirmation/:orderId', userAuth, checkoutController.showOrderConfirmation);

router.get('/check-wallet-balance', userAuth,checkoutController.checkWalletBalance);
router.post('/process-wallet-payment', userAuth,checkoutController.processWalletPayment);



// router.post("/api/address",userAuth, checkoutController.addnewAddress);
// router.post("/api/address/update",userAuth, checkoutController.editAddress);



//Order Management
router.get('/order',userAuth,orderController.getOrderPage)
router.get('/orderSummary/:orderId',userAuth,orderController.getOrderSummary)
router.post('/orders/cancel-item/:orderId/:itemId', orderController.cancelOrderItem);
router.post('/orders/cancel-all-orders/:orderId', userAuth, orderController.cancelAllOrders);
// router.post('/return-item/:itemId', userAuth, orderController.returnOrderItem);
router.post('/return-item/:itemId', userAuth, orderController.requestReturnOrder);
router.post('/retry-payment/:orderId', userAuth, orderController.retryPayment);
router.post('/verify-retry-payment', userAuth, orderController.verifyRetryPayment);

//Wishlist Management
router.get('/wishlist',userAuth,wishlistController.getWishlistpage)
router.post('/wishlist/add', userAuth, wishlistController.addToWishlist);
router.delete('/remove-from-wishlist/:productId', userAuth, wishlistController.removeFromWishlist);


//Wallet Management
router.get('/wallet',userAuth,walletController.getWalletPage)






module.exports=router;