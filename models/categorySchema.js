const mongoose=require("mongoose")
const {schema}=mongoose


const categorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  description: {
    type: String,
    default: ""
  },
  categoryImage: {
    type: String, 
    required: false
  },
  categoryOffer: {
    type: Number,
    required: false,
    min: 0,
    max: 100 
  },
  isListed: {
    type: Boolean,
    default: true
  },
  isDeleted: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

const Category = mongoose.model("Category", categorySchema);

module.exports=Category
