## Property Backend (Node.js + MongoDB)

### Setup

- **Install**: `npm install`
- **Configure env**: update `.env` (see `.env.example`)
- **Run**:
  - Dev: `npm run dev`
  - Prod: `npm start`

### Auth (Email + Password + JWT)

- `POST /api/auth/signup`
  - Body: `{ "name?": "Tanis", "email": "a@b.com", "password": "secret123", "confirmPassword": "secret123", "phone?": "..." }`
- `POST /api/auth/login`
  - Body: `{ "email": "a@b.com", "password": "secret123" }`
- `POST /api/auth/forgot-password`
  - Body: `{ "email": "a@b.com" }`
  - Sends a **6-digit OTP** to email via **EmailJS** (valid 10 minutes). Configure `EMAILJS_*` in `.env`.
- `POST /api/auth/reset-password`
  - Body: `{ "email": "a@b.com", "otp": "123456", "password": "newpass123", "confirmPassword": "newpass123" }`

Use header: `Authorization: Bearer <token>`

### Profile / Dashboard APIs

- `GET /api/profile` (profile)
- `PATCH /api/profile` (update profile)
- `DELETE /api/profile` (delete account)
- `GET /api/profile/favorites`
- `GET /api/profile/recently-viewed`
- `GET /api/profile/contacted`
- `GET /api/profile/enquiries` (buyer's submitted enquiries)
- `GET /api/profile/notifications`
- `POST /api/profile/notifications/:id/read`

### Properties

- **Public search/list**: `GET /api/properties`
  - Filters: `q,type,city,localArea,verifiedOnly,minPrice,maxPrice,minArea,maxArea,status`
  - Nearby: `lat,lng,radiusKm` (use `sort=nearest`)
  - Paging: `page,limit`
  - Sort: `latest | nearest | lowestPrice | highestPrice`

- **Public detail**: `GET /api/properties/:id` (includes `viewCount`, `enquiryCount`, `analytics`; view increments on each open)
- **Owner analytics**: `GET /api/properties/:id/analytics` (views, enquiries, favorites, calls, shares)
- **Create** (auth): `POST /api/properties`
- **Update** (owner): `PATCH /api/properties/:id`
- **Delete** (owner): `DELETE /api/properties/:id`
- **Upload media/docs** (owner): `POST /api/properties/:id/media` (multipart)
  - Fields: `photos[]`, `videos[]`, `registry`, `saleDeed`, `taxReceipt`
- **Mark sold** (owner): `POST /api/properties/:id/mark-sold`
- **Submit enquiry** (auth): `POST /api/properties/:id/enquiry` body: `{ "message", "name?", "email?", "phone?" }`
- **List enquiries** (owner): `GET /api/properties/:id/enquiries`
- **Update enquiry status** (owner): `PATCH /api/properties/:id/enquiries/:enquiryId` body: `{ "status": "pending|contacted|closed" }`
- **Favorite toggle** (auth): `POST /api/properties/:id/favorite`
- **Contact tracking** (auth): `POST /api/properties/:id/contact` body: `{ "method": "call|whatsapp|email" }`
- **Share tracking**: `POST /api/properties/:id/share`
- **Similar properties**: `GET /api/properties/:id/similar`
- **Seller info**: `GET /api/properties/:id/seller`

### Health

- `GET /health`

