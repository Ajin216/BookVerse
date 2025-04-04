// controllers/productController.js
const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
const User = require("../../models/userScheme");
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const router = require("../../routes/adminRouter");

const getProductAddPage = async (req, res) => {
  try {
    const category = await Category.find({ isListed: true, status: "active" });
    res.render("product-add", {
      cat: category
    });
  } catch (error) {
    console.error("Error loading add product page:", error);
    res.redirect("/pageerror");
  }
};





const addProducts = async (req, res) => {
  try {
    const processedImages = [];

    // Process base64 images from cropped data
    for (let i = 1; i <= 3; i++) {
      const base64Data = req.body[`croppedImage${i}`];
      if (base64Data) {
        // Remove the data:image/jpeg;base64 prefix
        const base64Image = base64Data.replace(/^data:image\/\w+;base64,/, '');
        const imageBuffer = Buffer.from(base64Image, 'base64');

        // Create filename and filepath
        const filename = `product-${Date.now()}-${i}.jpg`;
        const uploadDir = path.join("public", "uploads", "products");
        const filepath = path.join(uploadDir, filename);

        // Ensure upload directory exists
        await fs.promises.mkdir(uploadDir, { recursive: true });

        // Process image with sharp
        await sharp(imageBuffer)
          .resize(800, 800, {
            fit: "contain",
            background: { r: 255, g: 255, b: 255, alpha: 1 }
          })
          .jpeg({ quality: 90 })
          .toFile(filepath);

        processedImages.push(`/uploads/products/${filename}`);
      }
    }

    // Validate images
    if (processedImages.length === 0) {
      return res.redirect('/admin/addProducts?error=' + encodeURIComponent('At least one image is required'));
    }

    // Validate other required fields
    const requiredFields = ['productTitle', 'productSku', 'category', 'productPrice', 'author', 'description'];
    for (const field of requiredFields) {
      if (!req.body[field]) {
        return res.redirect('/admin/addProducts?error=' + encodeURIComponent(`${field} is required`));
      }
    }

    // Get category
    const category = await Category.findOne({ name: req.body.category });
    if (!category) {
      return res.redirect('/admin/addProducts?error=' + encodeURIComponent('Invalid category selected'));
    }

    // Create new product
    const product = new Product({
      productName: req.body.productTitle,
      author: req.body.author,
      description: req.body.description,
      category: category._id,
      regularPrice: parseFloat(req.body.productPrice),
      quantity: parseInt(req.body.productSku),
      productImage: processedImages,
      status: parseInt(req.body.productSku) > 0 ? "Available" : "Out Of Stock",
    });

    await product.save();

    // Redirect with success message
    res.redirect('/admin/addProducts?success=true');

  } catch (error) {
    console.error("Error adding product:", error);
    // Redirect with error message
    res.redirect('/admin/addProducts?error=' + encodeURIComponent('Failed to add product. Please try again.'));
  }
};





const showAllProducts = async (req, res) => {
  try {
    const search = req.query.search || "";
    const page = req.query.page || 1;
    const limit = 4;

    const productData = await Product.find({
      $or: [
        { productName: { $regex: new RegExp(".*" + search + ".*", "i") } },

      ],
    }).limit(limit * 1).skip((page - 1) * limit).populate('category').exec();



    const count = await Product.find({
      $or: [
        { productName: { $regex: new RegExp(".*" + search + ".*", "i") } },

      ]
    }).countDocuments();
    const category = await Category.find({ isListed: true, status: "active" })

    if (category) {
      res.render("product-list", {
        data: productData,
        currentPage: page,
        totalPages: Math.ceil(count / limit),
        cat: category,

      })
    } else {
      res.render("page-404")
    }
  } catch (error) {
    res.redirect("/pageerror")
  }
};




const blockProduct = async (req, res) => {
  try {
    let id = req.query.id;
    await Product.updateOne({ _id: id }, { $set: { isBlocked: true } });
    res.redirect("/admin/products");
  } catch (error) {
    res.redirect("/pageerror")

  }
};



const unblockProduct = async (req, res) => {
  try {
    let id = req.query.id;
    await Product.updateOne({ _id: id }, { $set: { isBlocked: false } });
    res.redirect("/admin/products");
  } catch (error) {
    res.redirect("/pageerror")

  }
};





const getEditProduct = async (req, res) => {
  try {
    const id = req.query.id;
    const product = await Product.findOne({ _id: id }).populate('category');
    const categories = await Category.find({});

    if (!product) {
      return res.redirect("/pageerror");
    }

    res.render("edit-product", {
      product: product,
      cat: categories,
      message: ''
    });
  } catch (error) {
    console.error(error);
    res.render("admin-error")
  }
};





const updateProduct = async (req, res) => {
  try {
    
    const productId = req.params.id;
    const existingProduct = await Product.findById(productId);

    if (!existingProduct) {
      return res.status(404).json({
        success: false,
        message: 'Product not found',
      });
    }

    // Copy the current product images
    const processedImages = [...existingProduct.productImage];

    // Process updated images
    for (let i = 1; i <= 3; i++) {
      const base64Data = req.body[`croppedImage${i}`];

      if (base64Data) {
        // Decode base64 and prepare for saving
        const base64Image = base64Data.replace(/^data:image\/\w+;base64,/, '');
        const imageBuffer = Buffer.from(base64Image, 'base64');
        const filename = `product-${Date.now()}-${i}.jpg`;

        const uploadDir = path.join("public", "uploads", "products");
        const filepath = path.join(uploadDir, filename);
        
        // Ensure upload directory exists
        await fs.promises.mkdir(uploadDir, { recursive: true });

        // Save the new image using sharp
        await sharp(imageBuffer)
          .resize(800, 800, {
            fit: 'contain',
            background: { r: 255, g: 255, b: 255, alpha: 1 },
          })
          .jpeg({ quality: 90 })
          .toFile(filepath);

        // Delete the old image if it exists
        if (processedImages[i - 1]) {
          const oldImagePath = path.join(__dirname, '..', 'public', processedImages[i - 1]);
          try {
            if (fs.existsSync(oldImagePath)) {
              await fs.promises.unlink(oldImagePath);
            }
          } catch (err) {
            console.error(`Error deleting old image: ${oldImagePath}`, err);
          }
        }

        // Update the processed image path
        processedImages[i - 1] = `/uploads/products/${filename}`;
      }
    }

    // Validate and update other fields
    const {
      productTitle: productName,
      author,
      description,
      productSku: quantity,
      category,
      productPrice: regularPrice,
      productOffer = 0,
    } = req.body;

    // Remove sale price validation and checks
    if (!productName || !author || !description || !category || !regularPrice) {
      return res.status(400).json({
        success: false,
        message: 'All required fields must be filled',
      });
    }

    const regularPriceNum = parseFloat(regularPrice);
    const quantityNum = parseInt(quantity);
    const status = quantityNum > 0 ? 'Available' : 'Out Of Stock';

    // Update the product in the database
    const updatedProduct = {
      productName,
      author,
      description,
      category,
      regularPrice: regularPriceNum,
      productOffer: parseFloat(productOffer),
      quantity: quantityNum,
      productImage: processedImages,
      status,
    };

    await Product.findByIdAndUpdate(productId, updatedProduct, { runValidators: true });

    res.status(200).json({
      success: true,
      message: 'Product updated successfully',
    });
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update product',
      error: error.message,
    });
  }
};




const deleteProduct = async (req, res) => {
  try {
    const productId = req.params.id;
    const product = await Product.findById(productId);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Delete associated images
    const imageDeletePromises = product.productImage.map(async (imagePath) => {
      if (imagePath && imagePath.trim() !== '') {
        try {
          // Normalize path to handle both absolute and relative paths
          const fullPath = path.isAbsolute(imagePath) 
            ? imagePath 
            : path.join(__dirname, "..", "public", imagePath);
          
          // Check if file exists before attempting to delete
          if (fs.existsSync(fullPath)) {
            await fs.promises.unlink(fullPath);
            console.log(`Successfully deleted image: ${fullPath}`);
          } else {
            console.log(`Image file not found: ${fullPath}`);
          }
        } catch (err) {
          console.error(`Error deleting image ${imagePath}:`, err);
          // Continue execution even if image deletion fails
        }
      }
    });

    // Wait for all image deletions to complete (or fail)
    await Promise.all(imageDeletePromises);

    // Delete the product from database
    await Product.findByIdAndDelete(productId);

    res.status(200).json({
      success: true,
      message: 'Product deleted successfully'
    });

  } catch (error) {
    console.error("Error deleting product:", error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete product'
    });
  }
};





module.exports = {
  getProductAddPage,
  addProducts,
  showAllProducts,
  blockProduct,
  unblockProduct,
  getEditProduct,
  updateProduct,
  deleteProduct
};