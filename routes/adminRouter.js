const express=require("express");
const router=express.Router();
const config=require("../config/config")
const session=require("express-session");
const nocache = require('nocache');
const upload = require('../middleware/multer');
const adminController=require("../controllers/admin/adminController");
const customerController=require("../controllers/admin/customerController")
const categoryController=require("../controllers/admin/categoryController")
const productController=require("../controllers/admin/productController")
const adminOrderController=require("../controllers/admin/adminOrderController")
const offerController=require("../controllers/admin/offerController")
const couponController=require("../controllers/admin/couponController")
const {user,Auth,adminAuth}=require("../middleware/auth")

router.use(session({
  secret:config.sessionSecret,
  resave:false,
  saveUninitialized:false,
  cookie:{
    path:'/admin',
    httpOnly:true
  }
}));

router.use(nocache());

router.get("/pageerror",adminController.pageerror)

//Login Management

router.get("/login",adminController.loadLogin);
router.post("/login",adminController.login);
router.get("/dashboard",adminAuth,adminController.loadDashboard)
router.get("/logout",adminAuth,adminController.logout)
router.get("/dashboard/report/pdf", adminAuth, adminController.downloadPDFReport);
router.get("/dashboard/report/excel", adminAuth, adminController.downloadExcelReport);

// Customer Management

router.get("/customers",adminAuth,customerController.customerInfo)
router.get("/blockCustomer",adminAuth,customerController.customerBlocked);
router.get("/unblockCustomer",adminAuth,customerController.customerUnblocked);


// Category Management

router.get("/category",adminAuth,categoryController.categoryInfo);
router.post("/addCategory", adminAuth, categoryController.addCategory);
router.post("/editCategory",adminAuth,categoryController.editCategory);


//Product Management

router.get("/addProducts",adminAuth,productController.getProductAddPage);
router.post('/addProducts', 
  upload.fields([
    { name: 'file1', maxCount: 1 },
    { name: 'file2', maxCount: 1 },
    { name: 'file3', maxCount: 1 }
  ]),
  productController.addProducts
);

router.get("/products",adminAuth,productController.showAllProducts);
router.get("/blockProduct",adminAuth,productController.blockProduct);
router.get("/unblockProduct",adminAuth,productController.unblockProduct);
router.get("/editProduct", adminAuth, productController.getEditProduct);
router.post('/editProduct/:id',
  upload.fields([
    { name: 'file1', maxCount: 1 },
    { name: 'file2', maxCount: 1 },
    { name: 'file3', maxCount: 1 }
  ]),
  adminAuth,
  productController.updateProduct
);
router.delete("/deleteProduct/:id", adminAuth, productController.deleteProduct);




//admin ordermanagement
router.get("/adminOrder", adminAuth, adminOrderController.getAdminOrderPage);
router.get("/order-details", adminAuth, adminOrderController.getOrderDetails);
router.post("/update-order-status", adminAuth, adminOrderController.updateOrderStatus);
router.post("/cancel-order-item", adminAuth, adminOrderController.cancelOrderItem);
// In your admin router file
router.post("/process-return-request", adminAuth, adminOrderController.processReturnRequest); 


//offer management
router.get("/offers",adminAuth,offerController.getOfferPage);

//product offer management
router.get("/productOffer",adminAuth,offerController.getProductOfferPage);
router.post("/addProductOffer", adminAuth, offerController.addProductOffer);
router.get("/editProductOffer/:id", adminAuth, offerController.getEditProductOfferPage);
router.post("/updateProductOffer", adminAuth, offerController.updateProductOffer);



//category offer management
router.get("/categoryOffer", adminAuth, offerController.getCategoryOfferPage);
router.post("/addCategoryOffer", adminAuth, offerController.addCategoryOffer);
router.get("/editCategoryOffer/:id", adminAuth, offerController.getEditCategoryOfferPage);
router.post("/updateCategoryOffer", adminAuth, offerController.updateCategoryOffer);

router.delete("/delete-offer/:id", adminAuth, offerController.deleteOffer);


//coupon management
router.get("/coupons", adminAuth, couponController.getCouponPage);
router.post("/add-coupon", adminAuth, couponController.addCoupon);
router.get("/get-coupon/:id", adminAuth, couponController.getCoupon);
router.put("/update-coupon", adminAuth, couponController.updateCoupon);
router.delete("/delete-coupon/:id", adminAuth, couponController.deleteCoupon);


module.exports=router;



