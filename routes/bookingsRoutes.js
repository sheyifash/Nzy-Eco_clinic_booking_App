
import express from "express";

import Slot from "../model/slot.js";
import Booking from "../model/booking.js";
import Idempotency from "../model/idempotency.js";
import BookingAttempt from "../model/bookingAttempt.js";
import apiKeyAuth from "../middlewares/apiKeyAuth.js";

const bookingRouter = express.Router();

bookingRouter.use(apiKeyAuth);

const WINDOW_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;

// Convert a booking document into the required API response.
function formatBooking(booking) {
  return {
    id: booking._id.toString(),
    slot_id: booking.slot_id,
    name: booking.name,
    email: booking.email,
    status: booking.status,
    created_at: booking.created_at.toISOString(),
  };
}

// Produce a stable representation of a JSON request body.
// This allows us to compare bodies regardless of property order.
function canonicalize(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(",")}]`;
  }

  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

// Save a response for an idempotency key before returning it.

async function waitForIdempotencyResponse(recordId) {
  // Wait for up to 30 seconds for the original request.
  for (let attempt = 0; attempt < 300; attempt++) {
    const record = await Idempotency.findById(recordId);

    if (!record) {
      return null;
    }

    if (record.status === "completed") {
      return record;
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return null;
}

function replayResponse(res, record) {
  return res
    .status(record.responseStatus)
    .json(record.responseBody);
}

async function sendResponse(res, status, body, idempotencyRecord) {
  if (idempotencyRecord) {
    try {
      idempotencyRecord.responseStatus = status;
      idempotencyRecord.responseBody = body;
      idempotencyRecord.status = "completed";

      await idempotencyRecord.save();
    } catch (error) {
      console.error("Failed to save idempotency response:", error);
    }
  }

  return res.status(status).json(body);
}
// Atomically record an attempt for an email address.
// The returned document tells us whether this attempt was allowed.

async function recordAttempt(email) {
  const now = new Date();
  const cutoff = new Date(now.getTime() - WINDOW_MS);

  const updatePipeline = [
    {
      $set: {
        email: { $ifNull: ["$email", email] },
        attempts: {
          $filter: {
            input: { $ifNull: ["$attempts", []] },
            as: "attempt",
            cond: { $gt: ["$$attempt", cutoff] },
          },
        },
      },
    },
    {
      $set: {
        blocked: {
          $gte: [{ $size: "$attempts" }, MAX_ATTEMPTS],
        },
        attempts: {
          $cond: [
            { $gte: [{ $size: "$attempts" }, MAX_ATTEMPTS] },
            "$attempts",
            { $concatArrays: ["$attempts", [now]] },
          ],
        },
      },
    },
  ];

  try {
    // First attempt: create the email record if it doesn't exist.
    return await BookingAttempt.findOneAndUpdate(
      { email },
      updatePipeline,
      {
        new: true,
        upsert: true,
        updatePipeline: true
      }
    );
  } catch (error) {
    if (error.code !== 11000) {
      throw error;
    }

    // Another request created this email's record simultaneously.
    // Retry against the document that now exists.
    const result = await BookingAttempt.findOneAndUpdate(
      { email },
      updatePipeline,
      {
        new: true,
        upsert: false,
        updatePipeline: true
      }
    );

    if (!result) {
      throw new Error("Could not update booking attempt record");
    }

    return result;
  }
}

// POST /bookings
bookingRouter.post("/bookings", async (req, res) => {
  let idempotencyRecord = null;

  try {
    const idempotencyKey = req.get("Idempotency-Key");
    const requestBody = req.body ?? {};

    
    // 1. Handle idempotency.
    if (idempotencyKey) {
      if (idempotencyKey.length > 255) {
        return res.status(400).json({
          error: "Idempotency-Key is too long",
        });
      }

      let existing = await Idempotency.findOne({
        key: idempotencyKey,
      });

      if (!existing) {
        try {
          // Reserve this key for the current request.
          idempotencyRecord = await Idempotency.create({
            key: idempotencyKey,
            requestBody,
            status: "processing",
          });
        } catch (error) {
          if (error.code !== 11000) {
            throw error;
          }

          // Another request claimed the key at the same time.
          existing = await Idempotency.findOne({
            key: idempotencyKey,
          });
        }
      }

      if (existing) {
        // The key cannot be reused with a different body.
        if (
          canonicalize(existing.requestBody) !==
          canonicalize(requestBody)
        ) {
          return res.status(422).json({
            error: "Idempotency key was already used with a different request body",
          });
        }

        if (existing.status === "completed") {
          return replayResponse(res, existing);
        }

        // Wait for the original request to finish.
        const completed = await waitForIdempotencyResponse(
          existing._id
        );

        if (completed) {
          return replayResponse(res, completed);
        }

        return res.status(409).json({
          error: "The original request is still processing. Retry using the same key.",
        });
      }
    }

    // 2. Normalize email before applying the rate limit.
    const email =
      typeof requestBody.email === "string"
        ? requestBody.email.trim().toLowerCase()
        : "";

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    // Count attempts for identifiable, valid email addresses.
    // This happens before the remaining validation so that
    // failed booking attempts are included.
    if (emailRegex.test(email)) {
      const rateLimit = await recordAttempt(email);

      if (rateLimit.blocked) {
        const oldestAttempt = new Date(
          Math.min(...rateLimit.attempts.map((date) => new Date(date).getTime()))
        );

        const retryAfter = Math.max(
          1,
          Math.ceil(
            (oldestAttempt.getTime() + WINDOW_MS - Date.now()) / 1000
          )
        );

        res.set("Retry-After", String(retryAfter));

        return sendResponse(
          res,
          429,
          { error: "Too many booking attempts. Please try again later." },
          idempotencyRecord
        );
      }
    }

    // 3. Validate required fields.
    const { slot_id, name } = requestBody;

    if (
      typeof slot_id !== "string" ||
      !slot_id.trim() ||
      typeof name !== "string" ||
      !name.trim() ||
      !email
    ) {
      return sendResponse(
        res,
        400,
        { error: "slot_id, name and email are required" },
        idempotencyRecord
      );
    }

    if (!emailRegex.test(email)) {
      return sendResponse(
        res,
        400,
        { error: "Invalid email address" },
        idempotencyRecord
      );
    }

    const normalizedSlotId = slot_id.trim();
    const normalizedName = name.trim();

    // 4. Check whether the slot exists.
    const slot = await Slot.findOne({
      id: normalizedSlotId,
    });

    if (!slot) {
      return sendResponse(
        res,
        404,
        { error: "Slot not found" },
        idempotencyRecord
      );
    }

    // 5. A slot cannot be booked once it has started.
    if (slot.start <= new Date()) {
      return sendResponse(
        res,
        400,
        { error: "This appointment slot has already started" },
        idempotencyRecord
      );
    }

    // 6. Create the booking.
    const booking = await Booking.create({
      slot_id: normalizedSlotId,
      name: normalizedName,
      email,
      status: "confirmed",
    });

    return sendResponse(
      res,
      201,
      formatBooking(booking),
      idempotencyRecord
    );

  } catch (error) {
    // A duplicate confirmed booking is prevented by the
    // unique partial index on Booking.
    if (error.code === 11000 && error.keyPattern?.slot_id) {
      return sendResponse(
        res,
        409,
        { error: "This appointment slot is already booked" },
        idempotencyRecord
      );
    }

    console.error("Booking creation error:", error);

    return sendResponse(
      res,
      500,
      { error: "Failed to create booking" },
      idempotencyRecord
    );
  }
});

// GET /bookings?email=ada@example.com&limit=10&cursor=...
bookingRouter.get("/bookings", async (req, res) => {
  try {
    const email =
      typeof req.query.email === "string"
        ? req.query.email.trim().toLowerCase()
        : "";

    if (!email) {
      return res.status(400).json({
        error: "Email query parameter is required",
      });
    }

    const limit = req.query.limit === undefined
      ? 10
      : Number(req.query.limit);

    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 50
    ) {
      return res.status(400).json({
        error: "Limit must be an integer between 1 and 50",
      });
    }

    const filter = { email };

    if (req.query.cursor) {
      let cursorData;

      try {
        cursorData = JSON.parse(
          Buffer.from(req.query.cursor, "base64url").toString("utf8")
        );
      } catch {
        return res.status(400).json({
          error: "Invalid cursor",
        });
      }

      if (
        !cursorData.created_at ||
        !mongoose.isValidObjectId(cursorData.id) ||
        Number.isNaN(Date.parse(cursorData.created_at))
      ) {
        return res.status(400).json({
          error: "Invalid cursor",
        });
      }

      const cursorDate = new Date(cursorData.created_at);

      filter.$or = [
        { created_at: { $gt: cursorDate } },
        {
          created_at: cursorDate,
          _id: { $gt: new mongoose.Types.ObjectId(cursorData.id) },
        },
      ];
    }

    // Fetch one extra result to determine whether another page exists.
    const results = await Booking.find(filter)
      .sort({ created_at: 1, _id: 1 })
      .limit(limit + 1);

    const hasMore = results.length > limit;
    const page = results.slice(0, limit);

    let nextCursor = null;

    if (hasMore) {
      const lastBooking = page[page.length - 1];

      nextCursor = Buffer.from(
        JSON.stringify({
          created_at: lastBooking.created_at.toISOString(),
          id: lastBooking._id.toString(),
        })
      ).toString("base64url");
    }

    return res.status(200).json({
      bookings: page.map(formatBooking),
      next_cursor: nextCursor,
    });

  } catch (error) {
    console.error("Get bookings error:", error);

    return res.status(500).json({
      error: "Failed to retrieve bookings",
    });
  }
});


import mongoose from "mongoose";

// GET /bookings/:id
bookingRouter.get("/bookings/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(404).json({
        error: "Booking not found",
      });
    }

    const booking = await Booking.findById(id);

    if (!booking) {
      return res.status(404).json({
        error: "Booking not found",
      });
    }

    return res.status(200).json(formatBooking(booking));

  } catch (error) {
    console.error("Get booking error:", error);

    return res.status(500).json({
      error: "Failed to retrieve booking",
    });
  }
});

// DELETE /bookings/:id
bookingRouter.delete("/bookings/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(404).json({
        error: "Booking not found",
      });
    }

    // Atomically cancel only a currently confirmed booking.
    const booking = await Booking.findOneAndUpdate(
      {
        _id: id,
        status: "confirmed",
      },
      {
        $set: {
          status: "cancelled",
        },
      },
      {
        new: true,
      }
    );

    if (booking) {
      return res.status(200).json(formatBooking(booking));
    }

    // If it wasn't found as confirmed, check whether it exists.
    const existingBooking = await Booking.findById(id);

    if (!existingBooking) {
      return res.status(404).json({
        error: "Booking not found",
      });
    }

    return res.status(409).json({
      error: "Booking has already been cancelled",
    });

  } catch (error) {
    console.error("Cancel booking error:", error);

    return res.status(500).json({
      error: "Failed to cancel booking",
    });
  }
});



export default bookingRouter;
