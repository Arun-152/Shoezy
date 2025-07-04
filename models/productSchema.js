const mongoose = require("mongoose");
const { Schema } = mongoose;

const productSchema = new Schema({
  productName: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  brand: {
    type: String,
    required: false
  },
  category: {
    type: Schema.Types.ObjectId,
    ref: "Category",
    required: true
  },
  regularPrice: {
    type: Number,
    required: true
  },
  salePrice: {
    type: Number,
    required: true
  },
  productOffer: {
    type: Number,
    default: 0
  },
  quantity: {
    type: Number,
    default: 0
  },
  color: {
    type: String,
    required: true
  },
  variants: [
    {
      size: {
        type: String,
        required: true
      },
      variantPrice: {
        type: Number,
        required: true
      },
      salePrice: {
        type: Number,
        required: true
      },
      variantQuantity: {
        type: Number,
        required: true
      }
    }
  ],
  productImage: {
    type: [String],
    required: true
  },
  isBlocked: {
    type: Boolean,
    default: false
  },
  tags: [
    {
      type: String
    }
  ],
  ratings: {
    average: {
      type: Number,
      default: 0
    },
    count: {
      type: Number,
      default: 0
    }
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  status: {
    type: String,
    enum: ["Available", "out of stock", "Discontinued"],
    required: true,
    default: "Available"
  }
}, {
  timestamps: true
});
const Product = mongoose.model("Product", productSchema);

module.exports = Product
