# 👟 Shoezy – Premium Footwear E-Commerce Platform

**Shoezy** is a full-stack e-commerce web application built for selling premium branded footwear. The platform provides a complete online shopping experience for users and a powerful admin dashboard for managing products, users, orders, coupons, and sales.

The project is built using **EJS, Node.js, Express.js, and MongoDB**, following the **MVC architecture**.

---

## 📌 Project Overview

Shoezy allows users to browse and purchase premium footwear across different categories such as:

* 👟 Casual Shoes
* 👞 Formal Shoes
* 🥾 Boots
* 📏 Multiple Shoe Sizes

Users can create an account, sign in using Google, browse products, add products to their cart or wishlist, apply coupons, make online payments, and track their orders.

The admin panel provides complete control over users, products, orders, coupons, and other e-commerce operations.

---

## 🚀 Features

### 👤 User Features

* User Registration
* User Login
* Google Sign Up / Login
* OTP / Email Authentication
* User Profile Management
* Product Browsing
* Product Search
* Product Filtering
* Multiple Product Categories
* Multiple Shoe Sizes
* Shopping Cart
* Wishlist
* Coupon Management
* Wallet System
* Razorpay Online Payment
* Order Placement
* Order Management
* Order History
* Password Management
* Session-Based Authentication

---

### 🛠️ Admin Features

* Admin Login
* Admin Dashboard
* User Management
* Block / Unblock Users
* Product Management
* Add Products
* Edit Products
* Delete Products
* Product Image Management
* Category Management
* Order Management
* Coupon Management
* Sales Management
* Revenue Tracking

---

## 🔐 Authentication

Shoezy uses **session-based authentication** with Passport.js and Express Session.

### Normal Authentication

1. User registers with their details.
2. Password is securely hashed using `bcrypt`.
3. User logs in with email and password.
4. A session is created after successful authentication.
5. The session is maintained using an HTTP-only `connect.sid` cookie.
6. Protected routes verify the user's session before allowing access.

### Google Authentication

Google authentication is implemented using:

**Passport.js + passport-google-oauth20**

Authentication flow:

```text
User
  ↓
Click "Sign in with Google"
  ↓
/auth/google
  ↓
Google OAuth Consent Screen
  ↓
/auth/google/callback
  ↓
Passport verifies Google profile
  ↓
Check existing user
  ↓
Create / Link User Account
  ↓
Create Session
  ↓
Redirect to Home Page
```

If a Google account does not already exist, Shoezy creates a new user account and wallet automatically.

If the email already exists, the Google account can be linked to the existing user account.

---

## 💳 Payment Integration

Shoezy uses **Razorpay** for online payments.

Payment flow:

```text
Add Product to Cart
        ↓
Checkout
        ↓
Create Razorpay Order
        ↓
Complete Payment
        ↓
Verify Payment
        ↓
Create Order
        ↓
Update User Wallet / Order Details
```

---

## 🖼️ Image Management

Product images are managed using **Cloudinary**.

Cloudinary provides:

* Image Upload
* Cloud Storage
* Image URLs
* Product Image Management

This avoids storing large image files directly in the MongoDB database.

---

## 🗄️ Database

Shoezy uses **MongoDB** as the database with **Mongoose ODM**.

Main collections/models include:

* User
* Product
* Cart
* Wishlist
* Wallet
* Order
* Coupon
* Category

MongoDB Atlas is used for cloud database hosting.

---

## 🏗️ Project Architecture

The application follows the **MVC (Model-View-Controller)** architecture.

```text
Shoezy
│
├── config/
│   └── passport.js
│
├── controllers/
│   ├── admin/
│   └── user/
│
├── helpers/
│
├── middlewares/
│
├── models/
│
├── public/
│   ├── css/
│   ├── js/
│   └── images/
│
├── routes/
│   ├── admin/
│   ├── user/
│   └── index.js
│
├── views/
│   ├── admin/
│   └── user/
│
├── app.js
├── package.json
└── README.md
```

---

## 🛠️ Technologies Used

| Technology       | Purpose                   |
| ---------------- | ------------------------- |
| EJS              | Server-side rendering     |
| HTML5            | Page structure            |
| CSS3             | Styling                   |
| JavaScript       | Client-side functionality |
| Node.js          | Backend runtime           |
| Express.js       | Web framework             |
| MongoDB          | Database                  |
| Mongoose         | MongoDB ODM               |
| Passport.js      | Authentication            |
| Google OAuth 2.0 | Google authentication     |
| Express Session  | Session management        |
| bcrypt           | Password hashing          |
| Razorpay         | Online payments           |
| Cloudinary       | Image storage             |
| Nodemailer       | Email/OTP functionality   |
| Render           | Deployment                |

---

## ⚙️ Installation

### 1. Clone the repository

```bash
git clone https://github.com/Arun-152/Shoezy.git
```

### 2. Navigate to the project

```bash
cd Shoezy
```

### 3. Install dependencies

```bash
npm install
```

---

## ▶️ Run the Project

Start the application using:

```bash
node app.js
```

For development, if you have Nodemon installed:

```bash
npx nodemon app.js
```

---

## 🌐 Live Demo

🚀 **Shoezy Live Website:**

https://shoezy-cz9i.onrender.com

---

## 🔄 Application Flow

### User Shopping Flow

```text
Register / Login
      ↓
Browse Products
      ↓
Search / Filter
      ↓
View Product
      ↓
Select Size
      ↓
Add to Cart
      ↓
Apply Coupon
      ↓
Checkout
      ↓
Razorpay Payment
      ↓
Order Confirmation
      ↓
Order History
```

### Admin Flow

```text
Admin Login
     ↓
Dashboard
     ↓
Manage Users
     ↓
Manage Products
     ↓
Manage Categories
     ↓
Manage Coupons
     ↓
Manage Orders
     ↓
View Sales / Revenue
```

---

## 🔒 Security

The project implements several security practices:

* Password hashing using bcrypt
* Session-based authentication
* HTTP-only session cookies
* Authentication middleware
* Admin authorization middleware
* Protected admin routes
* Google OAuth authentication
* Server-side validation

---


## 🎯 Learning Outcomes

Through this project, I gained practical experience in:

* Building a full-stack e-commerce application
* MVC architecture
* Node.js and Express.js
* MongoDB and Mongoose
* EJS server-side rendering
* Session-based authentication
* Passport.js
* Google OAuth 2.0
* Password hashing
* Razorpay payment integration
* Cloudinary image management
* Email/OTP functionality
* Admin dashboard development
* RESTful backend development
* Deployment using Render

---

## 🔮 Future Improvements

Some possible improvements for future versions:

* Product reviews and ratings
* Advanced recommendation system
* Improved sales analytics
* Order invoice generation
* Advanced product search
* Stock management improvements
* Mobile-responsive UI improvements
* Notification system
* Performance optimization

---

## 👨‍💻 Developer

**Arun**

Full-Stack Web Development Learner

This project was developed as part of my journey into full-stack web development.

---

## ⭐ Support

If you find this project useful or interesting, consider giving the repository a ⭐ on GitHub.

**Shoezy – Step into Style. 👟**
