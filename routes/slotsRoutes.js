
import express from "express";
import Slot from "../model/slot.js";
import Booking from "../model/booking.js";
import apiKeyAuth from "../middlewares/apiKeyAuth.js";

const slotsRouter = express.Router();

// Every route in this file requires an API key.
slotsRouter.use(apiKeyAuth);

// POST /reset
// Replace all slots and delete all existing bookings.
slotsRouter.post("/reset", async (req, res) => {
  try {
    const { slots } = req.body;

    if (!Array.isArray(slots)) {
      return res.status(400).json({
        error: "slots must be an array",
      });
    }

    // Validate each slot before changing the database.
    for (const slot of slots) {
      if (
        !slot.id ||
        !slot.provider ||
        !slot.start ||
        !slot.end ||
        Number.isNaN(Date.parse(slot.start)) ||
        Number.isNaN(Date.parse(slot.end)) ||
        new Date(slot.end) <= new Date(slot.start)
      ) {
        return res.status(400).json({
          error: "Each slot must have a valid id, provider, start, and end",
        });
      }
    }

    // Reject duplicate IDs in the same request.
    const ids = slots.map((slot) => slot.id);
    if (new Set(ids).size !== ids.length) {
      return res.status(400).json({
        error: "Slot IDs must be unique",
      });
    }

    // Clear bookings first, then replace slots.
    await Booking.deleteMany({});
    await Slot.deleteMany({});

    if (slots.length > 0) {
      await Slot.insertMany(slots);
    }

    return res.status(200).json({
      message: "Done",
    });
  } catch (error) {
    console.error("Reset error:", error.message);
    return res.status(500).json({
      error: "Failed to reset slots",
    });
  }
});

// GET /slots
// Return all slots, with availability.
slotsRouter.get("/slots", async (req, res) => {
  try {
    const { provider } = req.query;

    const filter = {};

    if (provider !== undefined) {
      filter.provider = provider;
    }

    const slots = await Slot.find(filter).sort({ start: 1 });

    const confirmedBookings = await Booking.find({
      status: "confirmed",
    }).select("slot_id");

    const bookedSlotIds = new Set(
      confirmedBookings.map((booking) => booking.slot_id)
    );

    const result = slots.map((slot) => ({
      id: slot.id,
      provider: slot.provider,
      start: slot.start.toISOString(),
      end: slot.end.toISOString(),
      available: !bookedSlotIds.has(slot.id),
    }));

    return res.status(200).json({ slots: result });
  } catch (error) {
    console.error("Get slots error:", error.message);
    return res.status(500).json({
      error: "Failed to retrieve slots",
    });
  }
});

export default slotsRouter;
