
import mongoose from "mongoose";

const bookingSchema = new mongoose.Schema({
  slot_id: {
    type: String,
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
  },
  status: {
    type: String,
    enum: ["confirmed", "cancelled"],
    default: "confirmed",
  },
  created_at: {
    type: Date,
    default: Date.now,
  },
});

bookingSchema.index(
  { slot_id: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: "confirmed",
    },
  }
);
bookingSchema.index({
  email: 1,
  created_at: 1,
  _id: 1,
});
const Booking = mongoose.model("Booking", bookingSchema);

export default Booking;
