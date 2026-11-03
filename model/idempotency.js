
import mongoose from "mongoose";

const idempotencySchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true,
  },
  requestBody: {
    type: mongoose.Schema.Types.Mixed,
    required: true,
  },
  status: {
    type: String,
    enum: ["processing", "completed"],
    default: "processing",
  },
  responseStatus: {
    type: Number,
  },
  responseBody: {
    type: mongoose.Schema.Types.Mixed,
  },
});

const Idempotency = mongoose.model(
  "Idempotency",
  idempotencySchema
);

export default Idempotency;
