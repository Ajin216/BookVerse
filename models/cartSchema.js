const mongoose = require("mongoose");
const { Schema } = mongoose;

const cartSchema = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    items: [
        {
            productId: {
                type: Schema.Types.ObjectId,
                ref: "Product",
                required: true,
            },
            quantity: {
                type: Number,
                default: 1,
                required: true,
                min: 1
            }
        }
    ]
}, { timestamps: true });

const Cart = mongoose.model("Cart", cartSchema);

module.exports = Cart;
