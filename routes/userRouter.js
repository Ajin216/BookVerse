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

router.post("/verify-otp",userAuthOut,userController.verifyOtp)
router.post("/resend-otp",userAuthOut,userController.resendOtp)

router.get('/auth/google',userAuthOut,passport.authenticate('google',{scope:['profile','email']}));

router.get('/auth/google/callback',userAuthOut,passport.authenticate('google',{failureRedirect:'/signin'}),(req,res)=>{
    res.redirect("/")
})

router.post("/login_user",userAuthOut,userController.login)

router.get("/logout",userController.logout)


router.get("/shop",userController.getShopPage)

router.get("/productDetails/:productId", userController.getProductDetails)


//Forgot Password
router.get("/forgotPassword", userAuthOut, userController.forgotPassword);
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


// router.post("/api/address",userAuth, checkoutController.addnewAddress);
// router.post("/api/address/update",userAuth, checkoutController.editAddress);



//Order Management
router.get('/order',userAuth,orderController.getOrderPage)
router.get('/orderSummary/:orderId',userAuth,orderController.getOrderSummary)
router.post('/orders/cancel-item/:orderId/:itemId', orderController.cancelOrderItem);
router.post('/orders/cancel-all-orders/:orderId', userAuth, orderController.cancelAllOrders);




module.exports=router;