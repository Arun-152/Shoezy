const mongoose = require("mongoose");
const Cart = require("../models/cartSchema");

async function fixCartSizes() {
    try {
        console.log("Starting cart size migration");
        
        const carts = await Cart.find({
            "items.size": { $exists: false }
        });

        console.log(`Found ${carts.length} carts with items missing size field`);

        for (const cart of carts) {
            let updated = false;
            
            cart.items.forEach(item => {
                if (!item.size) {
                    item.size = "Default";
                    updated = true;
                }
            });

            if (updated) {
                await cart.save();
                console.log(`Updated cart for user: ${cart.userId}`);
            }
        }

        console.log("Cart size migration completed successfully!");
        
    } catch (error) {
        console.error("Error during cart size migration:", error);
    }
}

module.exports = { fixCartSizes };

// Run migration if this file is executed directly
if (require.main === module) {
    const db = require("../config/db");
    
    db().then(() => {
        fixCartSizes().then(() => {
            console.log("Migration completed. Exiting...");
            process.exit(0);
        }).catch(error => {
            console.error("Migration failed:", error);
            process.exit(1);
        });
    });
}