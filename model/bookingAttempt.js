
import mongoose from "mongoose";

const bookingAttemptSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  attempts: {
    type: [Date],
    default: [],
  },
  blocked: {
    type: Boolean,
    default: false,
  },
});

const BookingAttempt = mongoose.model(
  "BookingAttempt",
  bookingAttemptSchema
);

export default BookingAttempt;
