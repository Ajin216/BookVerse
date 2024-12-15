// const mongoose = require("mongoose");
// const { Schema } = mongoose;

// const orderSchema = new Schema({
//     userId: {
//         type: Schema.Types.ObjectId,
//         ref: "User",
//         required: true
//     },
//     address: {
//         type: Schema.Types.ObjectId,
//         ref: "Address",
//         required: true
//     },
//     items: [
//         {
//             productId: {
//                 type: Schema.Types.ObjectId,
//                 ref: "Product",
//                 required: true
//             },
//             quantity: {
//                 type: Number,
//                 required: true,
//                 min: 1
//             },
//             price: {
//                 type: Number,
//                 required: true
//             },
//             productOffer: {
//                 type: Number,
//                 default: 0
//             }
//         }
//     ],
//     totalPrice: {
//         type: Number,
//         required: true
//     },
//     paymentMethod: {
//         type: String,
//         required: true
//     },
//     payment_status: {
//         type: String,
//         enum: ["Pending", "Completed", "Failed"],
//         default: "Pending"
//     },
//     order_status: {
//         type: String,
//         enum: ["Pending", "Processing", "Shipped", "Delivered", "Cancelled", "Returned", "Return Requested"],
//         default: "Pending"
//     },
//     orderId: {
//         type: String,
//         unique: true,
//         required: true
//     },
//     cancelReason: {
//         type: String,
//         default: ''
//     },
//     returnReason: {
//         type: String,
//         default: ''
//     },
//     deliveryDate: {
//         type: Date
//     }
// }, { timestamps: true });

// module.exports = mongoose.model("Order", orderSchema);





// const mongoose = require("mongoose");
// const { Schema } = mongoose;

// const orderSchema = new Schema({
//     userId: {
//         type: Schema.Types.ObjectId,
//         ref: "User",
//         required: true
//     },
//     addresses: [
//         {
//             userId: {
//                 type: Schema.Types.ObjectId,
//                 ref: 'User',
//                 required: true
//             },
//             addressName: {
//                 type: String,
//                 required: true
//             },
//             addressMobile: {
//                 type: String,
//                 required: true
//             },
//             addressHouse: {
//                 type: String,
//                 required: true
//             },
//             addressPost: {
//                 type: String,
//                 required: true
//             },
//             addressDistrict: {
//                 type: String,
//                 required: true
//             },
//             addressState: {
//                 type: String,
//                 required: true
//             },
//             addressPin: {
//                 type: Number,
//                 required: true
//             },
//             is_default: {
//                 type: Boolean,
//                 default: false
//             }
//         }
//     ],
//     items: [
//         {
//             productId: {
//                 type: Schema.Types.ObjectId,
//                 ref: "Product",
//                 required: true
//             },
//             name: {
//                 type: String,
//                 required: true
//             },
//             quantity: {
//                 type: Number,
//                 required: true,
//                 min: 1
//             },
//             price: {
//                 type: Number,
//                 required: true
//             },
//             productOffer: {
//                 type: Number,
//                 default: 0
//             },
//             status: {
//                 type: String,
//                 enum: ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled', 'Return Requested', 'Returned', 'Rejected'],
//                 default: 'Pending'
//             },
//             cancellation_reason: {
//                 type: String
//             },
//             total: {
//                 type: Number,
//                 required: true
//             }
//         }
//     ],
//     totalPrice: {
//         type: Number,
//         required: true
//     },
//     paymentMethod: {
//         type: String,
//         required: true
//     },
//     payment_status: {
//         type: String,
//         enum: ["Pending", "Completed", "Failed", "Processing"],
//         default: "Pending"
//     },
//     order_status: {
//         type: String,
//         enum: ["Pending", "Processing", "Shipped", "Delivered", "Cancelled", "Returned", "Return Requested"],
//         default: "Pending"
//     },
//     orderId: {
//         type: String,
//         unique: true,
//         required: true
//     },
//     cancelReason: {
//         type: String,
//         default: ''
//     },
//     returnReason: {
//         type: String,
//         default: ''
//     },
//     deliveryDate: {
//         type: Date
//     },
//     shipping_cost: {
//         type: Number,
//         default: 0
//     },
//     tax: {
//         type: Number,
//         default: 0
//     },
//     discount: {
//         type: Number,
//         default: 0
//     },
//     razorpay_order_id: {
//         type: String
//     },
//     razorpay_payment_id: {
//         type: String
//     },
//     razorpay_signature: {
//         type: String
//     }
// }, { timestamps: true });

// module.exports = mongoose.model("Order", orderSchema);



const mongoose = require("mongoose");
const { Schema } = mongoose;

const orderSchema = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    addresses: {
        type: Object,
        userId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        addressName: {
            type: String,
            required: true
        },
        addressMobile: {
            type: String,
            required: true
        },
        addressHouse: {
            type: String,
            required: true
        },
        addressPost: {
            type: String,
            required: true
        },
        addressDistrict: {
            type: String,
            required: true
        },
        addressState: {
            type: String,
            required: true
        },
        addressPin: {
            type: Number,
            required: true
        },
        is_default: {
            type: Boolean,
            default: false
        }
    },
    items: [
        {
            productId: {
                type: Schema.Types.ObjectId,
                ref: "Product",
                required: true
            },
            name: {
                type: String,
                required: true
            },
            quantity: {
                type: Number,
                required: true,
                min: 1
            },
            price: {
                type: Number,
                required: true
            },
            productOffer: {
                type: Number,
                default: 0
            },
            status: {
                type: String,
                enum: ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled', 'Return Requested', 'Returned', 'Rejected'],
                default: 'Pending'
            },
            cancellation_reason: {
                type: String
            },
            total: {
                type: Number,
                required: true
            }
        }
    ],
    totalPrice: {
        type: Number,
        required: true
    },
    paymentMethod: {
        type: String,
        required: true
    },
    payment_status: {
        type: String,
        enum: ["Pending", "Completed", "Failed", "Processing"],
        default: "Pending"
    },
    order_status: {
        type: String,
        enum: ["Pending", "Processing", "Shipped", "Delivered", "Cancelled", "Returned", "Return Requested"],
        default: "Pending"
    },
    orderId: {
        type: String,
        unique: true,
        required: true
    },
    cancelReason: {
        type: String,
        default: ''
    },
    returnReason: {
        type: String,
        default: ''
    },
    deliveryDate: {
        type: Date
    },
    shipping_cost: {
        type: Number,
        default: 0
    },
    tax: {
        type: Number,
        default: 0
    },
    discount: {
        type: Number,
        default: 0
    },
    razorpay_order_id: {
        type: String
    },
    razorpay_payment_id: {
        type: String
    },
    razorpay_signature: {
        type: String
    }
}, { timestamps: true });

module.exports = mongoose.model("Order", orderSchema);