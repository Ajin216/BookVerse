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
router.get("/editProduct",adminAuth,productController.getEditProduct);


router.post('/editProduct/:id',
  upload.fields([
    { name: 'file1', maxCount: 1 },
    { name: 'file2', maxCount: 1 },
    { name: 'file3', maxCount: 1 }
  ]),
  productController.updateProduct
);




//admin order
// Existing route
router.get("/adminOrder", adminAuth, adminOrderController.getAdminOrderPage);

// New route for order details
router.get("/order-details", adminAuth, adminOrderController.getOrderDetails);

// Add this route to handle order status updates
router.post("/update-order-status", adminAuth, adminOrderController.updateOrderStatus);








module.exports=router;



