const User = require('../../models/userSchema');
const Wallet = require('../../models/walletSchema');
const mongoose = require("mongoose");



const getWalletPage = async (req, res) => {
  try {
    const userId = req.session.userId;
    if (!userId) {
      return res.redirect("/login");
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).render("pageNotFound", { message: "User not found" });
    }

    let wallet = await Wallet.findOne({ userId });
    if (!wallet) {
      // Create a new wallet if it doesn't exist
      wallet = new Wallet({ userId, balance: 0, transactions: [] });
      await wallet.save();
    }

    const { typeFilter = 'all', sort = 'newest' } = req.query;

    // Build transaction query
    let transactions = wallet.transactions;

    // Apply type filter
    if (typeFilter !== 'all') {
      transactions = transactions.filter(txn => txn.type.toLowerCase() === typeFilter.toLowerCase());
    }

    // Apply sort
    transactions.sort((a, b) => {
      const dateA = new Date(a.createdAt);
      const dateB = new Date(b.createdAt);
      return sort === 'newest' ? dateB - dateA : dateA - dateB;
    });

    // Pagination
    const page = parseInt(req.query.page) || 1;
    const limit = 5;
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;
    const totalTransactions = transactions.length;
    const totalPages = Math.ceil(totalTransactions / limit);

    const paginatedTransactions = transactions.slice(startIndex, endIndex);

    res.render("walletPage", {
      user,
      wallet,
      transactions: paginatedTransactions,
      currentPage: page,
      totalPages,
      typeFilter,
      sort,
    });
  } catch (error) {
    console.error("Wallet page error:", error);
    res.status(500).render("pageNotFound", { message: "Server error" });
  }
};

const addFunds = async (req, res) => {
  try {
    const userId = req.session.userId;
    const { amount } = req.body;

    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    if (!amount || isNaN(amount) || amount <= 0) {
      return res.status(400).json({ success: false, message: "Invalid amount" });
    }

    const wallet = await Wallet.findOne({ userId });
    if (!wallet) {
      return res.status(404).json({ success: false, message: "Wallet not found" });
    }

    const newBalance = wallet.balance + parseFloat(amount);
    const transaction = {
      transactionId: 'TXN' + Date.now() + Math.random().toString(36).substr(2, 5).toUpperCase(),
      type: 'credit',
      amount: parseFloat(amount),
      description: 'Funds added by user',
      balanceAfter: newBalance,
      status: 'completed',
      source: 'user_credit',
      metadata: { paymentMethod: 'manual' }
    };

    wallet.transactions.push(transaction);
    wallet.balance = newBalance;
    await wallet.save();

    res.json({ success: true, message: "Funds added successfully", balance: newBalance });
  } catch (error) {
    console.error("Add funds error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};





module.exports = {
  getWalletPage,
  addFunds

};
