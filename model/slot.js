import mongoose from "mongoose";

const slotSchema = new mongoose.Schema({
    id: {
        type: String,
        required: true,
        unique: true
    },
     
  provider: {
    type: String,
    required: true,
  },
  start: {
    type: Date,
    required: true,
  },
  end: {
    type: Date,
    required: true,
  }
})

const Slot = mongoose.model("Slot", slotSchema);

export default Slot;