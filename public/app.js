
let apiBaseUrl =  window.location.hostname === "localhost"
  ? "http://localhost:8000"
  : "https://nzy-eco-clinic-booking-app.onrender.com";
let apiKey = "";
let selectedSlot = null;
let nextCursor = null;
let currentLookupEmail = "";

// DOM elements
const slotsContainer = document.getElementById("slots-container");
const bookingsContainer = document.getElementById("bookings-container");
const connectionIndicator = document.getElementById("connection-indicator");
const connectionText = document.getElementById("connection-text");
const bookButton = document.getElementById("book-btn");
const selectedSlotDisplay = document.getElementById("selected-slot");

// Display a notification.
function showToast(message) {
  const toast = document.getElementById("toast");

  toast.textContent = message;
  toast.style.display = "block";

  setTimeout(() => {
    toast.style.display = "none";
  }, 3000);
}

// Common function for all API requests.
async function apiRequest(path, options = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
      ...(options.headers || {}),
    },
  });

  const data = await response.json().catch(() => ({
    error: "Invalid server response",
  }));

  if (!response.ok) {
    const error = new Error(data.error || "Something went wrong");
    error.status = response.status;
    error.retryAfter = response.headers.get("Retry-After");
    throw error;
  }

  return data;
}

// Format appointment dates for display.
function formatDate(date) {
  return new Date(date).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

// Connect to the backend.
document.getElementById("connect-btn").addEventListener("click", async () => {
  const url = document.getElementById("api-url").value.trim();
  const key = document.getElementById("api-key").value.trim();

  if (!url || !key) {
    showToast("Enter your API URL and API key");
    return;
  }

  try {
    apiBaseUrl = url.replace(/\/+$/, "");
    apiKey = key;

    await loadSlots();

    connectionIndicator.classList.add("connected");
    connectionText.textContent = "Connected";

    showToast("Connected to clinic API");
  } catch (error) {
    apiKey = "";
    connectionIndicator.classList.remove("connected");
    connectionText.textContent = "Connection failed";

    showToast(error.message);
  }
});

// Load appointment slots.
async function loadSlots(provider = "") {
  slotsContainer.innerHTML = `
    <div class="empty-state">Loading appointments...</div>
  `;

  const query = provider
    ? `?provider=${encodeURIComponent(provider)}`
    : "";

  try {
    const data = await apiRequest(`/slots${query}`);

    renderSlots(data.slots);
  } catch (error) {
    slotsContainer.innerHTML = `
      <div class="empty-state">${escapeHtml(error.message)}</div>
    `;
    throw error;
  }
}

// Display slots.
function renderSlots(slots) {
  if (!slots.length) {
    slotsContainer.innerHTML = `
      <div class="empty-state">No appointment slots found.</div>
    `;
    return;
  }

  slotsContainer.innerHTML = slots.map((slot) => `
    <article class="slot-card ${
      selectedSlot?.id === slot.id ? "selected" : ""
    }">
      <h3>${escapeHtml(slot.provider)}</h3>

      <p>Start: ${formatDate(slot.start)}</p>
      <p>End: ${formatDate(slot.end)}</p>

      <p class="${slot.available ? "available" : "unavailable"}">
        ${slot.available ? "Available" : "Booked"}
      </p>

      <button
        class="btn ${slot.available ? "btn-primary" : "btn-secondary"}"
        data-slot-id="${escapeHtml(slot.id)}"
        ${slot.available ? "" : "disabled"}
      >
        ${slot.available ? "Select appointment" : "Unavailable"}
      </button>
    </article>
  `).join("");

  slotsContainer.querySelectorAll("[data-slot-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const slot = slots.find(
        (item) => item.id === button.dataset.slotId
      );

      selectSlot(slot);
    });
  });
}

// Select a slot for booking.
function selectSlot(slot) {
  selectedSlot = slot;

  document.getElementById("selected-slot-id").value = slot.id;

  selectedSlotDisplay.textContent =
    `${slot.provider} — ${formatDate(slot.start)}`;

  bookButton.disabled = false;

  renderSlotsFromSelection();
}

function renderSlotsFromSelection() {
  document.querySelectorAll(".slot-card").forEach((card) => {
    card.classList.remove("selected");
  });

  const buttons = slotsContainer.querySelectorAll("[data-slot-id]");

  buttons.forEach((button) => {
    if (button.dataset.slotId === selectedSlot?.id) {
      button.closest(".slot-card").classList.add("selected");
    }
  });
}

// Provider filter.
document.getElementById("filter-btn").addEventListener("click", () => {
  const provider = document.getElementById("provider-filter").value.trim();
  loadSlots(provider);
});

document.getElementById("clear-filter-btn").addEventListener("click", () => {
  document.getElementById("provider-filter").value = "";
  loadSlots();
});

document.getElementById("refresh-btn").addEventListener("click", () => {
  const provider = document.getElementById("provider-filter").value.trim();
  loadSlots(provider);
});

// Book an appointment.
document.getElementById("booking-form").addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!selectedSlot) {
    showToast("Please select an appointment first");
    return;
  }

  const name = document.getElementById("patient-name").value.trim();
  const email = document.getElementById("patient-email").value.trim();

  bookButton.disabled = true;
  bookButton.textContent = "Booking...";

  try {
    const data = await apiRequest("/bookings", {
      method: "POST",
      headers: {
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({
        slot_id: selectedSlot.id,
        name,
        email,
      }),
    });

    const message = document.getElementById("booking-message");

    message.className = "message success";
    message.textContent =
      `Booking confirmed! Your booking ID is ${data.id}`;

    document.getElementById("booking-form").reset();

    selectedSlot = null;
    document.getElementById("selected-slot-id").value = "";
    selectedSlotDisplay.textContent =
      "No appointment selected. Select a slot above first.";

    showToast("Appointment booked successfully");

    await loadSlots();
  } catch (error) {
    const message = document.getElementById("booking-message");

    message.className = "message error";
    message.textContent = error.retryAfter
      ? `${error.message} Try again in ${error.retryAfter} seconds.`
      : error.message;

    await loadSlots().catch(() => {});
  } finally {
    bookButton.textContent = "Confirm booking";
    bookButton.disabled = !selectedSlot;
  }
});

// Find bookings using email.
document.getElementById("lookup-form").addEventListener("submit", async (event) => {
  event.preventDefault();

  currentLookupEmail =
    document.getElementById("lookup-email").value.trim();

  nextCursor = null;

  await loadBookings();
});

// Load bookings and support cursor pagination.
async function loadBookings(append = false) {
  if (!currentLookupEmail) return;

  if (!append) {
    bookingsContainer.innerHTML = `
      <div class="empty-state">Loading bookings...</div>
    `;
  }

  const params = new URLSearchParams({
    email: currentLookupEmail,
    limit: "10",
  });

  if (append && nextCursor) {
    params.set("cursor", nextCursor);
  }

  try {
    const data = await apiRequest(`/bookings?${params}`);

    renderBookings(data.bookings, append);

    nextCursor = data.next_cursor;

    document.getElementById("next-page-btn")
      .classList.toggle("hidden", !nextCursor);

  } catch (error) {
    if (!append) {
      bookingsContainer.innerHTML = `
        <div class="empty-state">${escapeHtml(error.message)}</div>
      `;
    }

    showToast(error.message);
  }
}

// Display bookings.
function renderBookings(bookings, append = false) {
  if (!append) {
    bookingsContainer.innerHTML = "";
  }

  if (!bookings.length && !append) {
    bookingsContainer.innerHTML = `
      <div class="empty-state">No bookings found for this email.</div>
    `;
    return;
  }

  bookings.forEach((booking) => {
    const card = document.createElement("article");

    card.className = "booking-card";

    card.innerHTML = `
      <div>
        <h3>${escapeHtml(booking.name)}</h3>
        <p>Booking ID: ${escapeHtml(booking.id)}</p>
        <p>Slot: ${escapeHtml(booking.slot_id)}</p>
        <p>Email: ${escapeHtml(booking.email)}</p>
        <p>Created: ${formatDate(booking.created_at)}</p>
        <p class="${booking.status === "confirmed" ? "available" : "unavailable"}">
          ${escapeHtml(booking.status)}
        </p>
      </div>

      ${
        booking.status === "confirmed"
          ? `<button class="btn btn-secondary" data-cancel-id="${escapeHtml(booking.id)}">Cancel booking</button>`
          : ""
      }
    `;

    bookingsContainer.appendChild(card);
  });

  bookingsContainer.querySelectorAll("[data-cancel-id]").forEach((button) => {
    button.addEventListener("click", () => {
      cancelBooking(button.dataset.cancelId);
    });
  });
}

// Cancel a booking.
async function cancelBooking(id) {
  if (!confirm("Are you sure you want to cancel this appointment?")) {
    return;
  }

  try {
    await apiRequest(`/bookings/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });

    showToast("Booking cancelled successfully");

    nextCursor = null;
    await loadBookings();
    await loadSlots();

  } catch (error) {
    showToast(error.message);
  }
}

// Load the next page.
document.getElementById("next-page-btn").addEventListener("click", () => {
  if (nextCursor) {
    loadBookings(true);
  }
});

// Escape user-provided values before inserting them into HTML.
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character]);
}
