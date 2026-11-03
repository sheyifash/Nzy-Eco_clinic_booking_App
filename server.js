import express from "express"
import mongoose from "mongoose";
import dotenv from "dotenv";
import slotsRouter from "./routes/slotsRoutes.js";
import Booking from "./model/booking.js";
import bookingRouter from "./routes/bookingsRoutes.js";
import Idempotency from "./model/idempotency.js";
import BookingAttempt from "./model/bookingAttempt.js";

dotenv.config();

const app = express();
app.use(express.json());
app.use(express.static("public"));
app.get("/", (req, res) => {
    res.json({
       message: "Clinic booking API is running!"
    });
})

const PORT = process.env.PORT || 8080;

async function startServer() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("mongodb connected.....")
        await Booking.init();
        await Idempotency.init();
        await BookingAttempt.init();

        app.listen(PORT, () => {
            console.log(`server running on port ${PORT}`)
        });
    } catch (error) {
        console.error("failed to start server:", error.message);
         process.exit(1);
    }
}


app.use(slotsRouter);
app.use(bookingRouter);

startServer();

