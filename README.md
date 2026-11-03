# Nzy-Eco Clinic Booking API

A clinic appointment booking system built with **Node.js, Express.js, and MongoDB**. The application allows patients to view available appointment slots, book appointments, retrieve their bookings, and cancel appointments.

CarePoint also includes a simple web interface for interacting with the API.

## Features

- **Appointment Management:** View available appointment slots and filter them by healthcare provider.
- **Appointment Booking:** Book available slots with patient details.
- **Booking Validation:** Validate required fields, email addresses, and appointment availability.
- **Duplicate Booking Prevention:** Prevent multiple confirmed bookings for the same appointment slot, including concurrent requests.
- **Idempotency:** Support the `Idempotency-Key` header to prevent duplicate bookings when requests are retried.
- **Rate Limiting:** Limit booking attempts to five per email address within a rolling 60-second window.
- **Booking Retrieval:** Retrieve patient bookings using email addresses, with cursor-based pagination.
- **Booking Cancellation:** Cancel confirmed appointments and make their slots available again.
- **API Authentication:** Protect API endpoints using an API key.
- **Web Interface:** A simple responsive frontend for viewing slots and managing bookings.

## Technologies Used

- Node.js
- Express.js
- MongoDB Atlas
- Mongoose
- JavaScript
- HTML5
- CSS3

## Project Structure

```text
Clinic Booking API/
│
├── middleware/
│   └── apiKeyAuth.js
│
├── models/
│   ├── Slot.js
│   ├── Booking.js
│   ├── Idempotency.js
│   └── BookingAttempt.js
│
├── routes/
│   ├── slots.js
│   └── bookings.js
│
├── public/
│   ├── index.html
│   ├── style.css
│   └── app.js
│
├── .env
├── .gitignore
├── package.json
├── package-lock.json
├── README.md
└── server.js
```

## Installation and Setup

### 1. Clone the repository

```bash
git clone <your-github-repository-url>
```

Navigate into the project directory:

```bash
cd "Clinic Booking API"
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Create a `.env` file in the project root:

```env
PORT=8000
MONGODB_URI=your_mongodb_connection_string
API_KEY=your_secret_api_key
```

Replace the placeholder values with your MongoDB Atlas connection string and a secure API key.

**Important:** Never commit your `.env` file or expose your API key publicly.

### 4. Start the application

For development:

```bash
npm run dev
```

For production:

```bash
npm start
```

The application runs locally at:

```text
http://localhost:8000
```

## API Authentication

All API endpoints require an API key.

Include the following header in every API request:

| Header | Value |
|---|---|
| `X-API-Key` | Your configured API key |

Requests without a valid API key return:

```json
{
  "error": "Unauthorized"
}
```

## API Endpoints

The API uses JSON for request and response bodies.

| Method | Endpoint | Description |
|---|---|---|
| POST | `/reset` | Replace appointment slots and clear bookings |
| GET | `/slots` | Retrieve available appointment slots |
| POST | `/bookings` | Create an appointment booking |
| GET | `/bookings` | Retrieve bookings by patient email |
| GET | `/bookings/:id` | Retrieve a specific booking |
| DELETE | `/bookings/:id` | Cancel a booking |

### 1. Reset Appointment Slots

**POST `/reset`**

Replaces the existing appointment slots and deletes existing bookings.

Request body:

```json
{
  "slots": [
    {
      "id": "SLOT001",
      "provider": "Dr. Sarah Johnson",
      "start": "2026-11-04T09:00:00.000Z",
      "end": "2026-11-04T09:30:00.000Z"
    }
  ]
}
```

Successful response:

```json
{
  "message": "Done"
}
```

### 2. Get Appointment Slots

**GET `/slots`**

Returns appointment slots ordered by their start time.

Optional query parameter:

```text
?provider=Dr. Sarah Johnson
```

Each slot includes an `available` property indicating whether it can be booked.

### 3. Create an Appointment

**POST `/bookings`**

Request body:

```json
{
  "slot_id": "SLOT001",
  "name": "John Doe",
  "email": "john@example.com"
}
```

Optional header:

```text
Idempotency-Key: unique-request-key
```

A successful booking returns HTTP `201 Created` and a booking object containing its ID, appointment details, status, and creation timestamp.

### 4. Retrieve Patient Bookings

**GET `/bookings?email=john@example.com`**

Returns bookings associated with the supplied email address.

Optional pagination parameters:

- `limit`: Number of records to return (default: 10, maximum: 50).
- `cursor`: Cursor returned by the previous response.

### 5. Get a Specific Booking

**GET `/bookings/:id`**

Returns the details of a booking using its booking ID.

### 6. Cancel a Booking

**DELETE `/bookings/:id`**

Cancels an existing confirmed booking.

A cancelled appointment slot becomes available for another patient.

## Business Rules and Validation

- Required booking fields must be provided.
- Patient names and email addresses are trimmed.
- Email addresses are stored in lowercase.
- Invalid email addresses are rejected.
- Appointments that have already started cannot be booked.
- A slot cannot have more than one confirmed booking.
- Cancelled bookings do not prevent a slot from being booked again.
- Booking requests are limited to five attempts per email within 60 seconds.
- Repeated requests with the same idempotency key and request body return the original response.
- Reusing an idempotency key with a different request body returns HTTP `422`.

## Error Handling

The API uses standard HTTP status codes.

| Status | Meaning |
|---|---|
| 200 | Request successful |
| 201 | Booking created |
| 400 | Invalid request or validation error |
| 401 | Missing or invalid API key |
| 404 | Requested resource not found |
| 409 | Appointment conflict or already-cancelled booking |
| 422 | Idempotency key reused with a different request |
| 429 | Booking rate limit exceeded |
| 500 | Internal server error |

Errors are returned in the following format:

```json
{
  "error": "Error message"
}
```

## Frontend

CarePoint includes a responsive web interface that allows users to:

- Connect to the API using the base URL and API key.
- View appointment slots.
- Filter slots by healthcare provider.
- Select and book appointments.
- Retrieve bookings using a patient's email address.
- Cancel existing bookings.

When running locally, open:

```text
http://localhost:8000
```

## Deployment

The application can be deployed using a Node.js hosting platform such as Render.

Configure the following environment variables on your hosting platform:

- `PORT` (if required by the platform)
- `MONGODB_URI`
- `API_KEY`

After deployment, the public API base URL will be provided by the hosting platform.

## Future Improvements

- Patient registration and authentication.
- Provider dashboard for managing appointment schedules.
- Appointment reminders through email or SMS.
- Improved role-based access control.
- Administrative dashboard and appointment analytics.
- Dedicated endpoint for creating individual appointment slots.

## Author

**Oluwaseyi Fashina**

GitHub: [sheyifash](https://github.com/sheyifash)

---

*Nzy-Eco Clinic Booking API — Simplifying appointment scheduling and management.*